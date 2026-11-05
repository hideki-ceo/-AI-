import "server-only";
import {
  MAX_PROPERTIES_PER_ACCOUNT,
  monthlyPriceJpy,
} from "@/lib/billing";
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

export async function syncTenantStripePlan(tenantId: string) {
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
    throw new Error(`Unable to load subscription plan: ${tenantResult.error?.message ?? propertiesResult.error?.message}`);
  }
  const tenant = tenantResult.data;
  const subscriptionId = tenant.stripe_subscription_id;
  const billableProperties = propertiesResult.data.filter((property) => !property.is_exempt_from_billing);
  if (propertiesResult.data.length > MAX_PROPERTIES_PER_ACCOUNT) {
    throw new Error(`Account exceeds the ${MAX_PROPERTIES_PER_ACCOUNT}-property limit`);
  }
  if (!subscriptionId) return;

  const shouldCancel =
    tenant.is_free_tier ||
    billableProperties.length === 0;
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
  const items = (subscription as {
    items?: {
      data?: Array<{
        id: string;
        quantity?: number;
        price?: { unit_amount?: number | null; product?: string | { id: string } };
      }>;
    };
  }).items?.data ?? [];
  if (items.length !== 1) {
    throw new Error("Expected exactly one Stripe subscription item for property billing");
  }
  const monthlyPrice = monthlyPriceJpy(billableProperties.length);
  if (items[0].quantity === 1 && items[0].price?.unit_amount === monthlyPrice) return;

  const form = new URLSearchParams();
  form.set("items[0][id]", items[0].id);
  form.set("items[0][quantity]", "1");
  form.set("items[0][price_data][currency]", "jpy");
  form.set("items[0][price_data][unit_amount]", String(monthlyPrice));
  form.set("items[0][price_data][tax_behavior]", "inclusive");
  form.set("items[0][price_data][recurring][interval]", "month");
  const product = items[0].price?.product;
  const productId = typeof product === "string" ? product : product?.id;
  if (productId) {
    form.set("items[0][price_data][product]", productId);
  } else {
    form.set(
      "items[0][price_data][product_data][name]",
      billableProperties.length === 1 ? "Minpaku Report（1物件プラン）" : "Minpaku Report（2〜5物件プラン）",
    );
  }
  form.set("proration_behavior", "create_prorations");
  await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, "POST", form);
}
