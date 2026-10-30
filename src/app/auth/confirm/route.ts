import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const next = searchParams.get("next") ?? "/dashboard/bookings";
  const resolvedNext = new URL(next, request.url);
  const redirectPath =
    resolvedNext.origin === request.nextUrl.origin
      ? `${resolvedNext.pathname}${resolvedNext.search}${resolvedNext.hash}`
      : "/dashboard/bookings";
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const supabase = await createClient();

  let error: Error | null = null;
  if (tokenHash && (type === "recovery" || type === "signup")) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else if (code && (!type || type === "recovery" || type === "signup")) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    error = new Error("Invalid confirmation link");
  }

  const destination = error
    ? new URL("/login?error=confirm-link", request.url)
    : new URL(redirectPath, request.url);
  return NextResponse.redirect(destination);
}
