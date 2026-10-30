import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { deliverLockCode, LOCK_CODE_LEAD_DAYS } from "@/lib/lock-delivery";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

// 毎日 9:00 JST（vercel.json）。鍵番号の送信条件を満たしていて未送信の予約に送る。
//   * チェックインの1週間前になった日に、それまでに支払いと名簿が揃っていた予約へ送る
//   * 送信に失敗した予約の再試行
// 送るかどうかの最終判定は claim_lock_delivery が行う
function hasValidSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const actual = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (!hasValidSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const { data: bookings, error } = await createAdminClient()
    .from("bookings")
    .select("id")
    .eq("lock_code_sent", false)
    .eq("is_paid", true)
    .eq("is_guest_info_completed", true)
    .lte("check_in", addDays(today, LOCK_CODE_LEAD_DAYS))
    .gt("check_out", today)
    .not("status", "in", '("cancelled","canceled","black","deleted")')
    .order("check_in")
    .limit(500);
  if (error) {
    console.error("Lock delivery cron query failed", error);
    return NextResponse.json({ error: "Unable to load bookings" }, { status: 500 });
  }

  const result = { sent: 0, withheld: 0, failed: 0 };
  for (const booking of bookings) {
    try {
      result[await deliverLockCode(booking.id)] += 1;
    } catch (deliveryError) {
      result.failed += 1;
      console.error("Lock delivery cron attempt failed", booking.id, deliveryError);
    }
  }
  return NextResponse.json({ date: today, ...result });
}
