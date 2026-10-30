import "server-only";
import { fetchBeds24Booking, type Beds24Booking } from "@/lib/beds24";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/database";

// line_guests.booking_snapshot に保存する予約情報（AI のコンテキスト用。連絡先は含めない）
export type BookingSnapshot = {
  id: number;
  status: string;
  arrival: string;
  departure: string;
  numAdult: number;
  numChild: number;
  firstName: string | null;
};

// この間隔を過ぎたら Beds24 から取り直す（日程変更・キャンセルの反映）
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;
const ACTIVE_BOOKING_STATUSES = ["confirmed", "new", "request"];

type Property = Pick<Tables<"properties">, "id" | "beds24_property_id">;

// 総当たり対策: 24時間で5回失敗したら、その LINE ユーザーからの紐付けを受け付けない
const MAX_LINK_FAILURES = 5;
const LINK_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

// year が null = 年の記載なし（月日のみ照合）
type CheckInDate = { year: number | null; month: number; day: number };

export type BookingLinkRequest = {
  bookingId: string;
  // 予約確認メールのリンクから入力済みのメッセージ（チェックイン日の照合を省略する）
  fromEmailLink: boolean;
  // 手入力されたチェックイン日の解釈候補（月/日 と 日/月 のどちらとも取れる書き方は両方入る）
  checkInCandidates: CheckInDate[];
};

export type BookingLinkResult =
  | { status: "linked"; booking: BookingSnapshot }
  | { status: "not_found" }
  | { status: "locked" };

// 予約確認メールのリンクから入力済みになるメッセージ。parseBookingLinkRequest で fromEmailLink と判定される
export function bookingLinkMessage(bookingId: string): string {
  return `予約番号 / Booking No: ${bookingId}`;
}

const EMAIL_LINK_MESSAGE_RE = /^予約番号 \/ Booking No: (\d{5,12})$/;
const BOOKING_KEYWORD_RE =
  /(?:予約番号|予約ID|(?:booking|reservation)\s*(?:no\.?|number|id|#))\s*(?:[:#]|は|is)?\s*(\d{5,12})/i;

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAME_RE = `(${MONTH_NAMES.join("|")})[a-z]*\\.?`;

// 先頭から順に試し、最初に見つかった書き方を採用する
const DATE_PATTERNS: { re: RegExp; toCandidates: (m: RegExpMatchArray) => CheckInDate[] }[] = [
  {
    // 2026-11-03 / 2026/11/03 / 2026.11.03 / 2026年11月3日
    re: /(?<!\d)(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?!\d)\s*日?/,
    toCandidates: (m) => [{ year: +m[1], month: +m[2], day: +m[3] }],
  },
  {
    // 11/03/2026（米国式）と 03/11/2026（欧州式）
    re: /(?<!\d)(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})(?!\d)/,
    toCandidates: (m) => [
      { year: +m[3], month: +m[1], day: +m[2] },
      { year: +m[3], month: +m[2], day: +m[1] },
    ],
  },
  {
    // 11月3日
    re: /(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})(?!\d)\s*日?/,
    toCandidates: (m) => [{ year: null, month: +m[1], day: +m[2] }],
  },
  {
    // Nov 3 / November 3rd, 2026
    re: new RegExp(
      `\\b${MONTH_NAME_RE}\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+(\\d{4})(?!\\d))?`,
      "i",
    ),
    toCandidates: (m) => [
      { year: m[3] ? +m[3] : null, month: MONTH_NAMES.indexOf(m[1].toLowerCase()) + 1, day: +m[2] },
    ],
  },
  {
    // 3 Nov / 3rd November 2026
    re: new RegExp(
      `(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_NAME_RE}(?:,?\\s+(\\d{4})(?!\\d))?`,
      "i",
    ),
    toCandidates: (m) => [
      { year: m[3] ? +m[3] : null, month: MONTH_NAMES.indexOf(m[2].toLowerCase()) + 1, day: +m[1] },
    ],
  },
  {
    // 11/3（月/日 と 日/月 の両方）
    re: /(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/,
    toCandidates: (m) => [
      { year: null, month: +m[1], day: +m[2] },
      { year: null, month: +m[2], day: +m[1] },
    ],
  },
];

function extractCheckInDate(text: string): { candidates: CheckInDate[]; rest: string } {
  for (const { re, toCandidates } of DATE_PATTERNS) {
    const match = text.match(re);
    if (!match) continue;
    const candidates = toCandidates(match).filter(
      (c) => c.month >= 1 && c.month <= 12 && c.day >= 1 && c.day <= 31,
    );
    if (candidates.length === 0) continue;
    // 日付部分の数字を予約番号と取り違えないよう取り除く
    return { candidates, rest: text.replace(match[0], " ") };
  }
  return { candidates: [], rest: text };
}

// 予約番号を含むメッセージなら紐付けリクエストとして解釈する。含まなければ null
export function parseBookingLinkRequest(text: string): BookingLinkRequest | null {
  // 全角数字・全角記号を半角にそろえる
  const normalized = text.normalize("NFKC").trim();

  const fromLink = normalized.match(EMAIL_LINK_MESSAGE_RE);
  if (fromLink) {
    return { bookingId: fromLink[1], fromEmailLink: true, checkInCandidates: [] };
  }

  const { candidates, rest } = extractCheckInDate(normalized);
  const bookingId =
    rest.match(BOOKING_KEYWORD_RE)?.[1] ??
    // 日付と一緒に送られた場合は、キーワードなしの番号も予約番号とみなす
    (candidates.length > 0
      ? rest.match(/(?<!\d)(\d{5,12})(?!\d)/)?.[1]
      : rest.trim().match(/^#?(\d{5,12})$/)?.[1]);
  if (!bookingId) return null;

  return { bookingId, fromEmailLink: false, checkInCandidates: candidates };
}

function matchesCheckIn(arrival: string, candidates: CheckInDate[]): boolean {
  const [year, month, day] = arrival.split("-").map(Number);
  return candidates.some(
    (c) => c.month === month && c.day === day && (c.year === null || c.year === year),
  );
}

function todayJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// キャンセルされておらず、チェックアウト日を過ぎていない予約
function isBookingActive(booking: BookingSnapshot): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(booking.status) && booking.departure >= todayJst();
}

function toSnapshot(booking: Beds24Booking): BookingSnapshot {
  return {
    id: booking.id,
    status: booking.status,
    arrival: booking.arrival,
    departure: booking.departure,
    numAdult: booking.numAdult ?? 0,
    numChild: booking.numChild ?? 0,
    firstName: booking.firstName || null,
  };
}

// ゲストが送った予約番号（手入力ならチェックイン日も）を Beds24 で照合し、
// 有効な予約なら LINE ユーザーに紐付ける。同じ予約に複数の LINE ユーザー（同行者）を紐付けてもよい。
// 呼び出し側は checkInCandidates が空の手入力リクエストを渡さないこと（先にチェックイン日を求める）。
export async function linkGuestBooking(
  property: Property,
  lineUserId: string,
  request: BookingLinkRequest,
): Promise<BookingLinkResult> {
  const supabase = createAdminClient();
  const { data: guest, error } = await supabase
    .from("line_guests")
    .select("link_failure_count, link_failure_window_started_at")
    .eq("property_id", property.id)
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (error) throw new Error(`failed to load guest: ${error.message}`);

  const windowStartedAt = guest?.link_failure_window_started_at
    ? new Date(guest.link_failure_window_started_at).getTime()
    : 0;
  const windowActive = Date.now() - windowStartedAt < LINK_FAILURE_WINDOW_MS;
  if (windowActive && (guest?.link_failure_count ?? 0) >= MAX_LINK_FAILURES) {
    return { status: "locked" };
  }

  const booking = await fetchBeds24Booking(
    property.id,
    property.beds24_property_id,
    request.bookingId,
  );
  const snapshot = booking ? toSnapshot(booking) : null;
  const verified =
    snapshot !== null &&
    isBookingActive(snapshot) &&
    (request.fromEmailLink || matchesCheckIn(snapshot.arrival, request.checkInCandidates));

  if (!snapshot || !verified) {
    const { error: saveError } = await supabase.from("line_guests").upsert(
      {
        property_id: property.id,
        line_user_id: lineUserId,
        ...(windowActive
          ? { link_failure_count: (guest?.link_failure_count ?? 0) + 1 }
          : { link_failure_count: 1, link_failure_window_started_at: new Date().toISOString() }),
      },
      { onConflict: "property_id,line_user_id" },
    );
    if (saveError) throw new Error(`failed to record link failure: ${saveError.message}`);
    return { status: "not_found" };
  }

  const now = new Date().toISOString();
  const { error: linkError } = await supabase.from("line_guests").upsert(
    {
      property_id: property.id,
      line_user_id: lineUserId,
      beds24_booking_id: request.bookingId,
      booking_snapshot: snapshot,
      booking_synced_at: now,
      linked_at: now,
      link_failure_count: 0,
      link_failure_window_started_at: null,
    },
    { onConflict: "property_id,line_user_id" },
  );
  if (linkError) throw new Error(`failed to link booking: ${linkError.message}`);

  return { status: "linked", booking: snapshot };
}

// 紐付け済みで有効な予約を返す。未紐付け・キャンセル・チェックアウト後は null
export async function getActiveGuestBooking(
  property: Property,
  lineUserId: string,
): Promise<BookingSnapshot | null> {
  const supabase = createAdminClient();
  const { data: guest, error } = await supabase
    .from("line_guests")
    .select("id, beds24_booking_id, booking_snapshot, booking_synced_at")
    .eq("property_id", property.id)
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (error) throw new Error(`failed to load guest: ${error.message}`);
  if (!guest?.beds24_booking_id) return null;

  let snapshot = guest.booking_snapshot as unknown as BookingSnapshot | null;
  const syncedAt = guest.booking_synced_at ? new Date(guest.booking_synced_at).getTime() : 0;

  if (Date.now() - syncedAt > SNAPSHOT_TTL_MS) {
    try {
      const booking = await fetchBeds24Booking(
        property.id,
        property.beds24_property_id,
        guest.beds24_booking_id,
      );
      snapshot = booking ? toSnapshot(booking) : null;
      const { error: saveError } = await supabase
        .from("line_guests")
        .update({ booking_snapshot: snapshot, booking_synced_at: new Date().toISOString() })
        .eq("id", guest.id);
      if (saveError) console.error("failed to save booking snapshot", guest.id, saveError);
    } catch (err) {
      // Beds24 障害時はキャッシュで続行する
      console.error("failed to refresh booking from Beds24", guest.id, err);
    }
  }

  return snapshot && isBookingActive(snapshot) ? snapshot : null;
}
