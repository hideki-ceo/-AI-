import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const propertyCount =
    typeof body.property_count === "string" && body.property_count !== ""
      ? Number(body.property_count)
      : null;

  if (
    !name ||
    name.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    company.length > 160 ||
    message.length > 2000 ||
    (propertyCount !== null &&
      (!Number.isInteger(propertyCount) || propertyCount < 1 || propertyCount > 10_000))
  ) {
    return NextResponse.json({ error: "Invalid inquiry fields" }, { status: 400 });
  }

  const { error } = await createAdminClient().from("lead_inquiries").insert({
    name,
    email,
    company: company || null,
    message: message || null,
    property_count: propertyCount,
  });
  if (error) {
    console.error("Inquiry submission failed", error);
    return NextResponse.json({ error: "Unable to save inquiry" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
