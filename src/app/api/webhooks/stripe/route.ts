import { NextResponse, type NextRequest } from "next/server";
import { deliverLockCode } from "@/lib/lock-delivery";
import { parseStripeEvent, verifyStripeSignature } from "@/lib/stripe-signature";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// 月額サブスクリプション（プラットフォームの Stripe アカウント）の Webhook。
// ゲストの宿泊代金の支払い判定（bookings.is_paid）はここでは扱わない。
// オーナー独自サイトの宿泊代金は /api/webhooks/stripe-direct/[propertyId] で受ける。

function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

async function updateTenantBilling(
  tenantId: string,
  values: {
    customerId?: string | null;
    subscriptionId?: string | null;
    status?: string | null;
  },
) {
  const admin = createAdminClient();
  const tenantUpdate: {
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    stripe_subscription_status?: string | null;
  } = {};
  const profileUpdate: {
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    subscription_status?: string | null;
  } = {};
  if (values.customerId !== undefined) {
    tenantUpdate.stripe_customer_id = values.customerId;
    profileUpdate.stripe_customer_id = values.customerId;
  }
  if (values.subscriptionId !== undefined) {
    tenantUpdate.stripe_subscription_id = values.subscriptionId;
    profileUpdate.stripe_subscription_id = values.subscriptionId;
  }
  if (values.status !== undefined) {
    tenantUpdate.stripe_subscription_status = values.status;
    profileUpdate.subscription_status = values.status;
  }

  if (Object.keys(tenantUpdate).length) {
    const { error } = await admin.from("tenants").update(tenantUpdate).eq("id", tenantId);
    if (error) throw new Error(`Unable to update tenant Stripe state: ${error.message}`);
    const { error: profileError } = await admin.from("profiles").update(profileUpdate).eq("id", tenantId);
    if (profileError) throw new Error(`Unable to update profile Stripe state: ${profileError.message}`);
  }
}

async function findTenantId(customerId: string | null, metadataTenantId?: unknown): Promise<string | null> {
  if (typeof metadataTenantId === "string") return metadataTenantId;
  if (!customerId) return null;
  const { data, error } = await createAdminClient()
    .from("tenants")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(`Unable to find Stripe tenant: ${error.message}`);
  return data?.id ?? null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  const event = parseStripeEvent(rawBody);
  if (!event) return NextResponse.json({ error: "Invalid Stripe event" }, { status: 400 });

  const admin = createAdminClient();
  const { data: processed, error: processedError } = await admin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (processedError) {
    console.error("Stripe event dedup lookup failed", processedError);
    return NextResponse.json({ error: "Unable to process event" }, { status: 500 });
  }
  if (processed) return NextResponse.json({ received: true, duplicate: true });

  const object = event.data.object;
  const customerId = stripeId(object.customer);
  const metadata =
    typeof object.metadata === "object" && object.metadata !== null
      ? (object.metadata as Record<string, unknown>)
      : {};
  const tenantId = await findTenantId(customerId, metadata.tenant_id);
  if (!tenantId && event.type !== "checkout.session.completed") {
    return NextResponse.json({ error: "Stripe customer is not linked to a tenant" }, { status: 404 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const sessionTenantId =
        typeof metadata.tenant_id === "string" ? metadata.tenant_id : stripeId(object.client_reference_id);
      if (!sessionTenantId) throw new Error("Checkout session has no tenant reference");
      await updateTenantBilling(sessionTenantId, {
        customerId,
        subscriptionId: stripeId(object.subscription),
      });
    } else if (event.type.startsWith("customer.subscription.")) {
      const subscriptionStatus = typeof object.status === "string" ? object.status : "unknown";
      await updateTenantBilling(tenantId!, {
        customerId,
        subscriptionId: typeof object.id === "string" ? object.id : null,
        status: subscriptionStatus,
      });
    } else if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
      await updateTenantBilling(tenantId!, {
        customerId,
        status: "active",
      });
      // 月額料金の未払いで止まっていた、宿泊代金支払い済みの予約の鍵番号を送る
      const { data: bookings, error } = await admin
        .from("bookings")
        .select("id")
        .eq("tenant_id", tenantId!)
        .eq("is_paid", true)
        .eq("lock_code_sent", false);
      if (error) throw new Error(`Unable to load paid bookings: ${error.message}`);
      for (const booking of bookings ?? []) {
        try {
          await deliverLockCode(booking.id);
        } catch (error) {
          console.error("Stripe webhook lock delivery attempt failed", booking.id, error);
        }
      }
    } else if (event.type === "invoice.payment_failed") {
      await updateTenantBilling(tenantId!, {
        customerId,
        status: "past_due",
      });
    }

    const { error: recordError } = await admin.from("stripe_webhook_events").insert({ id: event.id });
    if (recordError && recordError.code !== "23505") throw new Error(`Unable to record Stripe event: ${recordError.message}`);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", event.id, error);
    return NextResponse.json({ error: "Stripe event processing failed" }, { status: 500 });
  }
}
