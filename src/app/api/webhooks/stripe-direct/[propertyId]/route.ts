import { NextResponse, type NextRequest } from "next/server";
import { deliverLockCode } from "@/lib/lock-delivery";
import { parseStripeEvent, verifyStripeSignature } from "@/lib/stripe-signature";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// オーナー独自サイトでの宿泊予約の代金支払い（オーナー自身の Stripe アカウント）の Webhook。
// オーナー側で Checkout Session（または PaymentIntent）の metadata に beds24_booking_id を設定する。
// 署名シークレットは物件ごとに property_secrets.stripe_direct_webhook_secret に保存する。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 支払い完了として扱うイベントと、object が支払い済みかどうかの判定
const PAID_EVENTS: Record<string, (object: Record<string, unknown>) => boolean> = {
  "checkout.session.completed": (object) => object.payment_status === "paid",
  "checkout.session.async_payment_succeeded": (object) => object.payment_status === "paid",
  "payment_intent.succeeded": (object) => object.status === "succeeded",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  if (!UUID_RE.test(propertyId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: secrets, error: secretsError } = await admin
    .from("property_secrets")
    .select("stripe_direct_webhook_secret")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (secretsError) {
    console.error("Direct Stripe webhook secret lookup failed", secretsError);
    return NextResponse.json({ error: "Unable to verify event" }, { status: 500 });
  }
  if (!secrets?.stripe_direct_webhook_secret) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), secrets.stripe_direct_webhook_secret)) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }
  const event = parseStripeEvent(rawBody);
  if (!event) return NextResponse.json({ error: "Invalid Stripe event" }, { status: 400 });

  // オーナーごとに別の Stripe アカウントなので、物件 ID を付けて重複排除する
  const eventKey = `direct:${propertyId}:${event.id}`;
  const { data: processed, error: processedError } = await admin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", eventKey)
    .maybeSingle();
  if (processedError) {
    console.error("Direct Stripe event dedup lookup failed", processedError);
    return NextResponse.json({ error: "Unable to process event" }, { status: 500 });
  }
  if (processed) return NextResponse.json({ received: true, duplicate: true });

  const isPaid = PAID_EVENTS[event.type];
  const object = event.data.object;
  if (isPaid?.(object)) {
    const metadata =
      typeof object.metadata === "object" && object.metadata !== null
        ? (object.metadata as Record<string, unknown>)
        : {};
    const beds24BookingId = typeof metadata.beds24_booking_id === "string" ? metadata.beds24_booking_id.trim() : "";
    // metadata のない決済（予約と無関係の商品など）は対象外
    if (/^\d{1,20}$/.test(beds24BookingId)) {
      const { data: booking, error: updateError } = await admin
        .from("bookings")
        .update({ is_paid: true, payment_source: "stripe_direct", paid_at: new Date().toISOString() })
        .eq("property_id", propertyId)
        .eq("beds24_booking_id", beds24BookingId)
        .select("id")
        .maybeSingle();
      if (updateError) {
        console.error("Direct Stripe booking payment update failed", updateError);
        return NextResponse.json({ error: "Unable to record payment" }, { status: 500 });
      }
      // 予約がまだ Beds24 から同期されていない。2xx 以外を返して Stripe に再送させる
      if (!booking) return NextResponse.json({ error: "Booking is not synchronized yet" }, { status: 409 });

      try {
        await deliverLockCode(booking.id);
      } catch (error) {
        console.error("Direct Stripe lock delivery attempt failed", booking.id, error);
      }
    } else if (beds24BookingId) {
      console.error("Direct Stripe payment has an invalid beds24_booking_id", event.id);
    }
  }

  const { error: recordError } = await admin.from("stripe_webhook_events").insert({ id: eventKey });
  if (recordError && recordError.code !== "23505") {
    console.error("Unable to record direct Stripe event", recordError);
    return NextResponse.json({ error: "Unable to record event" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
