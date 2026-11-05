import "./websocket-polyfill";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_PROPERTIES_PER_ACCOUNT, monthlyPriceJpy } from "@/lib/billing";
import { syncTenantStripePlan } from "@/lib/stripe-billing";

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && !process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required to apply subscription pricing updates");
  }

  const admin = createAdminClient();
  const { data: tenants, error: tenantError } = await admin
    .from("tenants")
    .select("id, stripe_subscription_id")
    .eq("stripe_subscription_status", "active")
    .not("stripe_subscription_id", "is", null);
  if (tenantError) throw new Error(`Unable to load active subscriptions: ${tenantError.message}`);

  const { data: properties, error: propertyError } = await admin
    .from("properties")
    .select("tenant_id, is_exempt_from_billing");
  if (propertyError) throw new Error(`Unable to load property counts: ${propertyError.message}`);

  const propertyCounts = new Map<string, { total: number; billable: number }>();
  for (const property of properties) {
    const counts = propertyCounts.get(property.tenant_id) ?? { total: 0, billable: 0 };
    counts.total += 1;
    if (!property.is_exempt_from_billing) counts.billable += 1;
    propertyCounts.set(property.tenant_id, counts);
  }

  const updates = (tenants ?? []).map((tenant) => {
    const counts = propertyCounts.get(tenant.id) ?? { total: 0, billable: 0 };
    if (counts.total > MAX_PROPERTIES_PER_ACCOUNT) {
      throw new Error(`Tenant ${tenant.id} exceeds the ${MAX_PROPERTIES_PER_ACCOUNT}-property limit`);
    }
    return {
      tenantId: tenant.id,
      billableProperties: counts.billable,
      monthlyPrice: monthlyPriceJpy(counts.billable),
    };
  });

  console.log(`${apply ? "Applying" : "Dry run:"} ${updates.length} active subscription price update(s).`);
  for (const update of updates) {
    console.log(
      `${update.tenantId}: ${update.billableProperties} billable properties -> ¥${update.monthlyPrice.toLocaleString("ja-JP")}/month`,
    );
  }
  if (!apply) {
    console.log("No Stripe changes made. Pass --apply to update subscriptions with Stripe proration.");
    return;
  }

  let failed = false;
  for (const update of updates) {
    try {
      await syncTenantStripePlan(update.tenantId);
      console.log(`Updated ${update.tenantId}`);
    } catch (error) {
      failed = true;
      console.error(`Failed to update ${update.tenantId}`, error);
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Stripe pricing sync failed", error);
  process.exitCode = 1;
});
