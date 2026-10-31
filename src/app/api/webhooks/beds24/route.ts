import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { fetchBeds24PaymentStatus } from "@/lib/beds24";
import { deliverLockCode } from "@/lib/lock-delivery";
import { isPrepaidOtaBooking } from "@/lib/ota";
import { sendTransactionalEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hasValidSecret(request: NextRequest): boolean {
  const secret = process.env.BEDS24_WEBHOOK_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const actual = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get("propertyId") ?? "";
  if (!UUID_RE.test(propertyId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!hasValidSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: Record<string, unknown>;
  try {
    const body = await request.json();
    payload =
      typeof body === "object" && body !== null && "booking" in body
        ? (body.booking as Record<string, unknown>)
        : (body as Record<string, unknown>);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const beds24BookingId = String(payload.id ?? "");
  const beds24PropertyId = String(payload.propertyId ?? "");
  const checkIn = typeof payload.arrival === "string" ? payload.arrival : "";
  const checkOut = typeof payload.departure === "string" ? payload.departure : "";
  const guestName = [payload.firstName, payload.lastName]
    .filter((name): name is string => typeof name === "string")
    .join(" ")
    .trim();
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  const adults = Number(payload.numAdult);
  const children = Number(payload.numChild ?? 0);
  const numGuests = adults + children;
  const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";

  if (
    !/^\d{1,20}$/.test(beds24BookingId) ||
    !/^\d{1,20}$/.test(beds24PropertyId) ||
    !DATE_RE.test(checkIn) ||
    !DATE_RE.test(checkOut) ||
    checkOut <= checkIn ||
    !Number.isInteger(numGuests) ||
    numGuests < 1 ||
    numGuests > 10 ||
    !status
  ) {
    return NextResponse.json({ error: "Invalid Beds24 booking payload" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid guest email" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("id, tenant_id, beds24_property_id, name")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyError) {
    console.error("Beds24 webhook property lookup failed", propertyError);
    return NextResponse.json({ error: "Unable to load property" }, { status: 500 });
  }
  if (!property || property.beds24_property_id !== beds24PropertyId) {
    return NextResponse.json({ error: "Property mismatch" }, { status: 404 });
  }

  const { data: previous, error: previousError } = await admin
    .from("bookings")
    .select("id, is_paid, payment_source, paid_at")
    .eq("property_id", propertyId)
    .eq("beds24_booking_id", beds24BookingId)
    .maybeSingle();
  if (previousError) {
    console.error("Beds24 webhook booking lookup failed", previousError);
    return NextResponse.json({ error: "Unable to load booking" }, { status: 500 });
  }

  const isCancelled = ["cancelled", "canceled", "black", "deleted"].includes(status);
  const isOta = isPrepaidOtaBooking(payload);
  let beds24Paid: boolean | null = null;
  if (!isOta) {
    try {
      beds24Paid = await fetchBeds24PaymentStatus(propertyId, beds24PropertyId, beds24BookingId);
    } catch (error) {
      console.error("Beds24 payment status lookup failed", beds24BookingId, error);
    }
  }

  let paymentUpdate: { is_paid: boolean; payment_source: "beds24" | "ota" | null; paid_at: string | null } | null = null;
  if (isOta && previous?.payment_source !== "stripe_direct") {
    paymentUpdate = {
      is_paid: true,
      payment_source: "ota",
      paid_at: previous?.is_paid && previous.paid_at ? previous.paid_at : new Date().toISOString(),
    };
  } else if (beds24Paid === true && previous?.payment_source !== "stripe_direct") {
    paymentUpdate = {
      is_paid: true,
      payment_source: "beds24",
      paid_at: previous?.is_paid && previous.paid_at ? previous.paid_at : new Date().toISOString(),
    };
  } else if (beds24Paid === false && previous?.payment_source === "beds24") {
    paymentUpdate = { is_paid: false, payment_source: null, paid_at: null };
  }

  const { data: booking, error: upsertError } = await admin
    .from("bookings")
    .upsert(
      {
        tenant_id: property.tenant_id,
        property_id: propertyId,
        beds24_booking_id: beds24BookingId,
        source:
          typeof payload.channel === "string" && payload.channel
            ? payload.channel.slice(0, 120)
            : typeof payload.referer === "string"
              ? payload.referer.slice(0, 120)
              : null,
        guest_name: guestName,
        guest_email: email || null,
        guest_phone: phone || null,
        check_in: checkIn,
        check_out: checkOut,
        num_guests: numGuests,
        status,
        ...(previous ? {} : { is_paid: false, is_guest_info_completed: false }),
        ...paymentUpdate,
      },
      { onConflict: "property_id,beds24_booking_id" },
    )
    .select("id")
    .single();
  if (upsertError) {
    console.error("Beds24 webhook booking upsert failed", upsertError);
    return NextResponse.json({ error: "Unable to synchronize booking" }, { status: 500 });
  }

  if (email && !previous && !isCancelled) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
    if (!appUrl) return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured" }, { status: 500 });
    try {
      await sendTransactionalEmail({
        idempotencyKey: `registry-invite-${booking.id}`,
        to: email,
        subject: "宿泊者情報のご登録をお願いします",
        text:
          `${guestName || "ゲスト"} 様\n\n${property.name} のご予約ありがとうございます。\n` +
          `チェックイン前に、以下の専用フォームからご宿泊者全員の情報をご登録ください。\n\n` +
          `${appUrl}/guest?bookingId=${booking.id}\n\n` +
          (isOta
            ? "鍵番号はチェックインの1週間前からご案内します。"
            : "宿泊名簿の登録と代金の決済が確認できるまで鍵番号はご案内されません。" +
              "すべての確認が取れましたら、チェックインの1週間前から鍵番号のご案内をいたします。"),
      });
    } catch (error) {
      console.error("Beds24 registry invitation email failed", booking.id, error);
      return NextResponse.json({ error: "Booking synced but registry invitation email failed" }, { status: 502 });
    }
  }

  if (!isCancelled && !previous?.is_paid && !paymentUpdate && !isOta && beds24Paid !== true) {
    return NextResponse.json({ received: true });
  }

  if (isCancelled) {
    try {
      await admin.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
    } catch (error) {
      console.error("Beds24 webhook cancellation sync failed", booking.id, error);
    }
  }

  return NextResponse.json({ received: true });
}
