import { NextResponse, type NextRequest } from "next/server";
import { bookingLinkMessage } from "@/lib/guest-booking";
import { getBotInfo, oaMessageUrl } from "@/lib/line";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOOKING_ID_RE = /^\d{5,12}$/;

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get("propertyId") ?? "";
  const bookingId = request.nextUrl.searchParams.get("bookingId") ?? "";

  if (!UUID_RE.test(propertyId) || !BOOKING_ID_RE.test(bookingId)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const supabase = createAdminClient();
  const { data: property, error } = await supabase
    .from("properties")
    .select("line_basic_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) {
    console.error("booking link: failed to load property", propertyId, error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
  if (!property) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let basicId = property.line_basic_id;
  if (!basicId) {
    try {
      basicId = await resolveBasicId(propertyId);
    } catch (err) {
      console.error("booking link: failed to resolve LINE basic ID", propertyId, err);
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  }

  return NextResponse.redirect(oaMessageUrl(basicId, bookingLinkMessage(bookingId)), 302);
}

async function resolveBasicId(propertyId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data: secrets, error } = await supabase
    .from("property_secrets")
    .select("line_channel_access_token")
    .eq("property_id", propertyId)
    .single();
  if (error) throw new Error(`failed to load LINE credentials: ${error.message}`);

  const { basicId } = await getBotInfo(secrets.line_channel_access_token);
  const { error: saveError } = await supabase
    .from("properties")
    .update({ line_basic_id: basicId })
    .eq("id", propertyId);
  if (saveError) console.error("booking link: failed to save LINE basic ID", propertyId, saveError);

  return basicId;
}
