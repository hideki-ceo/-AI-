import { NextResponse, type NextRequest } from "next/server";
import { BASE_PRICE_JPY } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const [tenantResult, profileResult, propertyResult] = await Promise.all([
    admin.from("tenants").select("*").eq("id", authData.user.id).single(),
    admin.from("profiles").select("is_internal_free").eq("id", authData.user.id).single(),
    admin.from("properties").select("id, is_exempt_from_billing").eq("tenant_id", authData.user.id),
  ]);
  if (tenantResult.error || profileResult.error || propertyResult.error) {
    console.error("Checkout account lookup failed", tenantResult.error ?? profileResult.error ?? propertyResult.error);
    return NextResponse.json({ error: "Unable to load billing account" }, { status: 500 });
  }
  const tenant = tenantResult.data;
  if (tenant.is_free_tier || profileResult.data.is_internal_free) {
    return NextResponse.json({ error: "This account is exempt from billing" }, { status: 409 });
  }
  if (tenant.stripe_subscription_status === "active") {
    return NextResponse.json({ error: "Subscription is already active" }, { status: 409 });
  }
  const billableProperties = propertyResult.data.filter((property) => !property.is_exempt_from_billing).length;
  if (billableProperties === 0) {
    return NextResponse.json({ error: "No billable properties are registered" }, { status: 409 });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (!stripeSecret || !appUrl) {
    console.error("Stripe checkout configuration is missing");
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const form = new URLSearchParams({
    mode: "subscription",
    client_reference_id: tenant.id,
    success_url: `${appUrl}/admin/billing?checkout=success`,
    cancel_url: `${appUrl}/admin/billing?checkout=cancelled`,
    "line_items[0][price_data][currency]": "jpy",
    "line_items[0][price_data][unit_amount]": String(BASE_PRICE_JPY),
    "line_items[0][price_data][tax_behavior]": "inclusive",
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": "Minpaku AI Concierge（1物件あたり）",
    "line_items[0][quantity]": String(billableProperties),
    "subscription_data[metadata][tenant_id]": tenant.id,
    "metadata[tenant_id]": tenant.id,
  });
  if (tenant.stripe_customer_id) {
    form.set("customer", tenant.stripe_customer_id);
  } else {
    form.set("customer_email", tenant.email);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const result = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !result.url) {
    console.error("Stripe checkout creation failed", response.status, result.error?.message);
    return NextResponse.json({ error: "Unable to create checkout session" }, { status: 502 });
  }
  return NextResponse.json({ url: result.url });
}
