import { NextResponse, type NextRequest } from "next/server";
import { authorizeProperty } from "@/lib/authorize-property";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const guestId = request.nextUrl.searchParams.get("guestId") ?? "";
  if (!UUID_RE.test(guestId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: guest, error } = await admin
    .from("guest_members")
    .select("booking_id, passport_image_key")
    .eq("id", guestId)
    .maybeSingle();
  if (error) {
    console.error("Passport authorization lookup failed", error);
    return NextResponse.json({ error: "Unable to authorize passport access" }, { status: 500 });
  }
  if (!guest?.passport_image_key) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("property_id")
    .eq("id", guest.booking_id)
    .single();
  if (bookingError) {
    console.error("Passport booking lookup failed", bookingError);
    return NextResponse.json({ error: "Unable to authorize passport access" }, { status: 500 });
  }
  const authorization = await authorizeProperty(booking.property_id);
  if (!authorization.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!authorization.property) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error: signedUrlError } = await admin.storage
    .from("passports")
    .createSignedUrl(guest.passport_image_key, 300);
  if (signedUrlError) {
    console.error("Passport signed URL creation failed", signedUrlError);
    return NextResponse.json({ error: "Unable to create passport access URL" }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl, expiresIn: 300 });
}
