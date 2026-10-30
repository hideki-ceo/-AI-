// 代金を OTA が回収するため、予約時点で支払い済みとみなす経路。
// Booking.com / Agoda / Expedia は現地払いの予約もあるので含めない（Beds24 の入金記録で判定する）
const PREPAID_OTA_RE = /airbnb/i;

// Beds24 の予約の channel / referer / apiSource のいずれかで判定する
export function isPrepaidOtaBooking(payload: Record<string, unknown>): boolean {
  return [payload.channel, payload.referer, payload.apiSource].some(
    (value) => typeof value === "string" && PREPAID_OTA_RE.test(value),
  );
}
