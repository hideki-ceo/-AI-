import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

async function stripeRequest(path: string, method: "GET" | "POST" | "DELETE", form?: URLSearchParams) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const result = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) throw new Error(`Stripe ${method} ${path} failed: ${result.error?.message ?? response.status}`);
  return result;
}

export async function syncTenantStripeQuantity(tenantId: string) {
  const admin = createAdminClient();
  const [tenantResult, propertiesResult] = await Promise.all([
    admin
      .from("tenants")
      .select("stripe_subscription_id, stripe_subscription_status, is_free_tier")
      .eq("id", tenantId)
      .single(),
    admin.from("properties").select("id, is_exempt_from_billing").eq("tenant_id", tenantId),
  ]);
  if (tenantResult.error || propertiesResult.error) {
    throw new Error(`Unable to load subscription quantity: ${tenantResult.error?.message ?? propertiesResult.error?.message}`);
  }
  const tenant = tenantResult.data;
  const subscriptionId = tenant.stripe_subscription_id;
  if (!subscriptionId) return;

  const shouldCancel =
    tenant.is_free_tier ||
    propertiesResult.data.filter((property) => !property.is_exempt_from_billing).length === 0;
  if (shouldCancel) {
    if (tenant.stripe_subscription_status !== "canceled") {
      await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, "DELETE");
      const { error } = await admin
        .from("tenants")
        .update({ stripe_subscription_status: "canceled" })
        .eq("id", tenantId);
      if (error) throw new Error(`Unable to save canceled subscription state: ${error.message}`);
      const { error: profileError } = await admin
        .from("profiles")
        .update({ subscription_status: "canceled" })
        .eq("id", tenantId);
      if (profileError) throw new Error(`Unable to save canceled profile state: ${profileError.message}`);
    }
    return;
  }

  if (tenant.stripe_subscription_status !== "active") return;
  const subscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, "GET");
  const items = (subscription as { items?: { data?: Array<{ id: string }> } }).items?.data ?? [];
  if (items.length !== 1) {
    throw new Error("Expected exactly one Stripe subscription item for property billing");
  }
  const quantity = propertiesResult.data.filter((property) => !property.is_exempt_from_billing).length;
  const form = new URLSearchParams({
    "items[0][id]": items[0].id,
    "items[0][quantity]": String(quantity),
    proration_behavior: "create_prorations",
  });
  await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, "POST", form);
}
