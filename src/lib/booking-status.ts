// 予約一覧に表示する鍵番号の送信状況。
// 条件は claim_lock_delivery（DB）と deliverLockCode（LINE 連携・メールアドレス）に合わせること。
import type { PaymentSource } from "@/types/database";
import { LOCK_CODE_LEAD_DAYS } from "@/lib/lock-delivery";

export const CANCELLED_STATUSES = ["cancelled", "canceled", "black", "deleted"];

export const PAYMENT_SOURCE_LABELS: Record<PaymentSource, string> = {
  beds24: "Beds24",
  stripe_direct: "自社サイト（Stripe）",
  ota: "Airbnb",
};

export type LockState = "sent" | "processing" | "scheduled" | "ready" | "blocked" | "failed" | "cancelled";

export type BookingStatusInput = {
  check_in: string;
  status: string;
  num_guests: number;
  is_paid: boolean;
  is_guest_info_completed: boolean;
  lock_code_sent: boolean;
  lock_code_delivery_status: "pending" | "processing" | "sent" | "failed";
  lock_code_delivery_error: string | null;
  guest_email: string | null;
  submittedGuests: number;
  allGuestsCompleted: boolean;
  lineLinked: boolean;
  serviceActive: boolean;
};

export type BookingStatus = {
  state: LockState;
  // 送信を止めている理由（オーナーが対応すべきもの・ゲストの対応待ちのもの）
  reasons: string[];
  sendFrom: string;
  // チェックインの1週間前を過ぎているのに送れていない
  needsAttention: boolean;
};

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function bookingStatus(booking: BookingStatusInput, todayJst: string): BookingStatus {
  const sendFrom = addDays(booking.check_in, -LOCK_CODE_LEAD_DAYS);
  const base = { sendFrom, reasons: [] as string[], needsAttention: false };
  if (booking.lock_code_sent) return { ...base, state: "sent" };
  if (CANCELLED_STATUSES.includes(booking.status)) return { ...base, state: "cancelled" };
  if (booking.lock_code_delivery_status === "processing") return { ...base, state: "processing" };

  const reasons: string[] = [];
  if (!booking.serviceActive) reasons.push("ご利用契約が有効ではありません（お支払い状況をご確認ください）");
  if (!booking.is_paid) reasons.push("代金の決済が確認できていません");
  const registryComplete =
    booking.is_guest_info_completed &&
    booking.allGuestsCompleted &&
    booking.submittedGuests === booking.num_guests;
  if (!registryComplete) {
    reasons.push(`宿泊名簿が未提出です（${booking.submittedGuests} / ${booking.num_guests} 名）`);
  }
  if (!booking.guest_email) reasons.push("ゲストのメールアドレスがありません");
  if (!booking.lineLinked) reasons.push("ゲストが LINE を連携していません");

  const inWindow = todayJst >= sendFrom;
  if (booking.lock_code_delivery_status === "failed") {
    if (booking.lock_code_delivery_error) reasons.push(`前回の送信エラー: ${booking.lock_code_delivery_error}`);
    return { sendFrom, reasons, state: "failed", needsAttention: true };
  }
  if (reasons.length) return { sendFrom, reasons, state: "blocked", needsAttention: inWindow };
  return { ...base, state: inWindow ? "ready" : "scheduled" };
}
