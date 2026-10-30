import type { BookingSnapshot } from "@/lib/guest-booking";

// 予約の紐付けに関する定型文。AI を通さず、返信モードに関係なく即時送信する。
// ゲストの言語が分からない段階で送るため日本語＋英語の併記にする。
export type FixedReply = {
  text: string; // ゲストに送る文
  japanese: string; // 管理画面表示用（chat_messages.ai_reply_japanese）
};

function bilingual(japanese: string, english: string): FixedReply {
  return { text: `${japanese}\n\n${english}`, japanese };
}

export function askForBookingReply(): FixedReply {
  return bilingual(
    "メッセージありがとうございます。ご予約を確認するため、予約番号とチェックイン日を送信してください。\n例: 12345678 2026-11-03\n（予約確認メールのリンクから開いた場合は、入力済みのメッセージをそのまま送信してください）",
    "Thank you for your message. To confirm your reservation, please send us your booking number and check-in date.\nExample: 12345678 2026-11-03\n(If you opened this chat from the link in your confirmation email, just send the pre-filled message.)",
  );
}

// 予約番号だけが手入力で送られた場合
export function askForCheckInDateReply(bookingId: string): FixedReply {
  return bilingual(
    `ご本人確認のため、予約番号とチェックイン日を一緒に送信してください。\n例: ${bookingId} 2026-11-03`,
    `For verification, please send your booking number together with your check-in date.\nExample: ${bookingId} 2026-11-03`,
  );
}

export function bookingLinkLockedReply(): FixedReply {
  return bilingual(
    "予約の確認に続けて失敗したため、受け付けを一時停止しています。24時間後にもう一度お試しいただくか、ご予約されたサイトのメッセージ機能からお問い合わせください。",
    "Reservation verification has been temporarily suspended after several failed attempts. Please try again in 24 hours, or contact us through the messaging feature of the site where you booked.",
  );
}

export function bookingLinkedReply(booking: BookingSnapshot): FixedReply {
  const dates = `${booking.arrival} - ${booking.departure}`;
  return bilingual(
    `ご予約を確認しました（${dates}）。ご滞在に関するご質問をお気軽にお送りください。`,
    `Your reservation has been confirmed (${dates}). Feel free to send us any questions about your stay.`,
  );
}

// 予約番号・チェックイン日のどちらが違ったかは伝えない（総当たりの手がかりにさせない）
export function bookingNotFoundReply(): FixedReply {
  return bilingual(
    "ご入力の内容に一致する有効なご予約が見つかりませんでした。予約番号とチェックイン日をご確認のうえ、もう一度送信してください。\n例: 12345678 2026-11-03",
    "We could not find an active reservation matching your details. Please check your booking number and check-in date and send them again.\nExample: 12345678 2026-11-03",
  );
}
