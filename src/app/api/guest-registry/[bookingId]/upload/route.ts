import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  if (!UUID_RE.test(bookingId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { contentType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const extension = EXTENSIONS[contentType];
  if (!extension) return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });

  const admin = createAdminClient();
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, lock_code_sent")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    console.error("Passport upload booking lookup failed", bookingError);
    return NextResponse.json({ error: "Unable to authorize upload" }, { status: 500 });
  }
  if (!booking || booking.lock_code_sent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const path = `${bookingId}/${randomUUID()}.${extension}`;
  const { data, error } = await admin.storage.from("passports").createSignedUploadUrl(path);
  if (error) {
    console.error("Unable to create passport upload URL", error);
    return NextResponse.json({ error: "Unable to prepare passport upload" }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token }, { status: 201 });
}
