import { NextResponse, type NextRequest } from "next/server";
import { deliverLockCode } from "@/lib/lock-delivery";
import { validateGuestRegistry } from "@/lib/guest-registry";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  if (!UUID_RE.test(bookingId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: booking, error } = await createAdminClient()
    .from("bookings")
    .select("id, check_in, check_out, num_guests, is_guest_info_completed, lock_code_sent, property_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    console.error("Guest registry lookup failed", error);
    return NextResponse.json({ error: "Unable to load booking" }, { status: 500 });
  }
  if (!booking || booking.lock_code_sent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: property, error: propertyError } = await createAdminClient()
    .from("properties")
    .select("name")
    .eq("id", booking.property_id)
    .single();
  if (propertyError) {
    console.error("Guest registry property lookup failed", propertyError);
    return NextResponse.json({ error: "Unable to load property" }, { status: 500 });
  }
  return NextResponse.json({
    propertyName: property.name,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    numGuests: booking.num_guests,
    isCompleted: booking.is_guest_info_completed,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  if (!UUID_RE.test(bookingId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { guests?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("num_guests, lock_code_sent")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    console.error("Guest registry submission lookup failed", bookingError);
    return NextResponse.json({ error: "Unable to submit registry" }, { status: 500 });
  }
  if (!booking || booking.lock_code_sent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const guests = validateGuestRegistry(body.guests, booking.num_guests);
  if (!guests) {
    return NextResponse.json({ error: "Guest details and required passport documents are incomplete" }, { status: 400 });
  }
  const validKeys = guests
    .map((guest) => guest.passport_image_key)
    .filter((key): key is string => key !== null);
  if (validKeys.length) {
    if (
      new Set(validKeys).size !== validKeys.length ||
      validKeys.some((key) => !key.startsWith(`${bookingId}/`))
    ) {
      return NextResponse.json({ error: "Passport image upload is missing" }, { status: 400 });
    }
    const uploads = await Promise.all(
      validKeys.map((key) => admin.storage.from("passports").createSignedUrl(key, 1)),
    );
    const missingUpload = uploads.find((result) => result.error);
    if (missingUpload) {
      console.error("Passport upload verification failed", missingUpload.error);
      return NextResponse.json({ error: "Passport image upload is missing" }, { status: 400 });
    }
  }

  const { error } = await admin.rpc("submit_guest_registry", {
    p_booking_id: bookingId,
    p_guests: guests,
  });
  if (error) {
    console.error("Guest registry save failed", error);
    return NextResponse.json({ error: "Unable to save guest registry" }, { status: 500 });
  }

  try {
    await deliverLockCode(bookingId);
  } catch (deliveryError) {
    console.error("Lock code delivery after registry submission failed", deliveryError);
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
