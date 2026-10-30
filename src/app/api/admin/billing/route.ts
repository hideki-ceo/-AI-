import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { syncTenantStripeQuantity } from "@/lib/stripe-billing";

type AdminContext = { id: string };

async function getAdmin(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;
  const { data: profile, error } = await createAdminClient()
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  if (error || profile.role !== "admin") return null;
  return { id: authData.user.id };
}

export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const [tenants, properties] = await Promise.all([
    admin.from("tenants").select("id, name, email, is_free_tier, free_reason").order("name"),
    admin
      .from("properties")
      .select("id, tenant_id, name, address, is_exempt_from_billing, management_contract_ref")
      .order("name"),
  ]);
  if (tenants.error || properties.error) {
    console.error("Admin billing list failed", tenants.error ?? properties.error);
    return NextResponse.json({ error: "Unable to load billing accounts" }, { status: 500 });
  }
  return NextResponse.json({ tenants: tenants.data, properties: properties.data });
}

export async function PATCH(request: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.id !== "string" || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid toggle request" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (body.kind === "tenant") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (body.enabled && !reason) {
      return NextResponse.json({ error: "A free-access reason is required" }, { status: 400 });
    }
    const { data: existing, error: lookupError } = await admin
      .from("tenants")
      .select("is_free_tier, free_reason")
      .eq("id", body.id)
      .single();
    if (lookupError) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { error: tenantError } = await admin
      .from("tenants")
      .update({
        is_free_tier: body.enabled,
        free_reason: body.enabled ? reason.slice(0, 500) : null,
      })
      .eq("id", body.id);
    if (tenantError) {
      console.error("Admin free-tier toggle failed", tenantError);
      return NextResponse.json({ error: "Unable to update tenant exemption" }, { status: 500 });
    }
    const { error: profileError } = await admin
      .from("profiles")
      .update({ is_internal_free: body.enabled })
      .eq("id", body.id);
    if (profileError) {
      await admin
        .from("tenants")
        .update({ is_free_tier: existing.is_free_tier, free_reason: existing.free_reason })
        .eq("id", body.id);
      console.error("Admin profile free-tier synchronization failed", profileError);
      return NextResponse.json({ error: "Unable to synchronize account exemption" }, { status: 500 });
    }
    try {
      await syncTenantStripeQuantity(body.id);
    } catch (error) {
      await Promise.all([
        admin
          .from("tenants")
          .update({ is_free_tier: existing.is_free_tier, free_reason: existing.free_reason })
          .eq("id", body.id),
        admin.from("profiles").update({ is_internal_free: existing.is_free_tier }).eq("id", body.id),
      ]);
      console.error("Admin free-tier Stripe sync failed", error);
      return NextResponse.json({ error: "Exemption saved but Stripe could not be synchronized" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "property") {
    const managementRef = typeof body.management_contract_ref === "string"
      ? body.management_contract_ref.trim()
      : "";
    if (body.enabled && !managementRef) {
      return NextResponse.json({ error: "A management contract reference is required" }, { status: 400 });
    }
    const { data: existing, error: lookupError } = await admin
      .from("properties")
      .select("tenant_id, is_exempt_from_billing, management_contract_ref")
      .eq("id", body.id)
      .single();
    if (lookupError) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const { error } = await admin
      .from("properties")
      .update({
        is_exempt_from_billing: body.enabled,
        management_contract_ref: body.enabled ? managementRef.slice(0, 200) : null,
      })
      .eq("id", body.id);
    if (error) {
      console.error("Admin property exemption update failed", error);
      return NextResponse.json({ error: "Unable to update property exemption" }, { status: 500 });
    }
    try {
      await syncTenantStripeQuantity(existing.tenant_id);
    } catch (syncError) {
      const { error: rollbackError } = await admin
        .from("properties")
        .update({
          is_exempt_from_billing: existing.is_exempt_from_billing,
          management_contract_ref: existing.management_contract_ref,
        })
        .eq("id", body.id);
      if (rollbackError) console.error("Admin property exemption rollback failed", rollbackError);
      console.error("Admin property exemption Stripe sync failed", syncError);
      return NextResponse.json({ error: "Stripe could not be synchronized; the change was reverted" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown exemption type" }, { status: 400 });
}
