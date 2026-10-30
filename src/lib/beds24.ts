import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BEDS24_API_BASE = "https://beds24.com/api/v2";
// 失効直前のトークンを使わないよう、期限の5分前に更新する
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// https://beds24.com/api/v2 の Booking（使う項目のみ）
export type Beds24Booking = {
  id: number;
  propertyId: number;
  roomId?: number;
  // 'confirmed' | 'request' | 'new' | 'cancelled' | 'black' | 'inquiry'
  status: string;
  arrival: string; // YYYY-MM-DD
  departure: string; // YYYY-MM-DD
  numAdult?: number;
  numChild?: number;
  firstName?: string;
  lastName?: string;
};

export type Beds24Credentials = {
  refreshToken: string;
  accessToken: string;
  expiresAt: string; // ISO 8601
};

// 招待コード（Beds24 管理画面 Settings > Marketplace > API で発行）を refresh token に交換する。
// 招待コードは1回しか使えないため、他の入力値の検証を済ませてから呼ぶこと。
export async function exchangeBeds24InviteCode(inviteCode: string): Promise<Beds24Credentials> {
  const res = await fetch(`${BEDS24_API_BASE}/authentication/setup`, {
    headers: { code: inviteCode, deviceName: "Minpaku AI Concierge" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Beds24 invite code exchange failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { token: string; expiresIn: number; refreshToken: string };
  return {
    refreshToken: body.refreshToken,
    accessToken: body.token,
    expiresAt: new Date(Date.now() + body.expiresIn * 1000).toISOString(),
  };
}

// アカウントで管理している物件（物件登録時に beds24_property_id の確認に使う）
export async function listBeds24Properties(
  accessToken: string,
): Promise<{ id: number; name: string }[]> {
  const res = await fetch(`${BEDS24_API_BASE}/properties`, {
    headers: { token: accessToken },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Beds24 GET /properties failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: { id: number; name: string }[] };
  return body.data ?? [];
}

// refresh token から access token（24h 有効）を発行する
export async function refreshBeds24AccessToken(refreshToken: string): Promise<Beds24Credentials> {
  const res = await fetch(`${BEDS24_API_BASE}/authentication/token`, {
    headers: { refreshToken },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Beds24 token refresh failed: ${res.status} ${await res.text()}`);
  }
  const { token, expiresIn } = (await res.json()) as { token: string; expiresIn: number };
  return {
    refreshToken,
    accessToken: token,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

// access token を property_secrets にキャッシュし、期限切れなら refresh token で再発行する
export async function getBeds24AccessToken(propertyId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data: secrets, error } = await supabase
    .from("property_secrets")
    .select("beds24_refresh_token, beds24_access_token, beds24_access_token_expires_at")
    .eq("property_id", propertyId)
    .single();
  if (error) throw new Error(`failed to load Beds24 credentials: ${error.message}`);

  const expiresAt = secrets.beds24_access_token_expires_at
    ? new Date(secrets.beds24_access_token_expires_at).getTime()
    : 0;
  if (secrets.beds24_access_token && expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return secrets.beds24_access_token;
  }

  const credentials = await refreshBeds24AccessToken(secrets.beds24_refresh_token);
  const { error: saveError } = await supabase
    .from("property_secrets")
    .update({
      beds24_access_token: credentials.accessToken,
      beds24_access_token_expires_at: credentials.expiresAt,
    })
    .eq("property_id", propertyId);
  // 保存に失敗しても今回のリクエストには使える
  if (saveError) console.error("Beds24: failed to cache access token", propertyId, saveError);

  return credentials.accessToken;
}

export async function fetchBeds24Booking(
  propertyId: string,
  beds24PropertyId: string,
  bookingId: string,
): Promise<Beds24Booking | null> {
  const token = await getBeds24AccessToken(propertyId);
  return getBeds24Booking(token, beds24PropertyId, bookingId);
}

// DB を介さず access token で直接取得する（接続テスト用にも使う）
export async function getBeds24Booking(
  accessToken: string,
  beds24PropertyId: string,
  bookingId: string,
): Promise<Beds24Booking | null> {
  const query = new URLSearchParams({ id: bookingId, propertyId: beds24PropertyId });

  const res = await fetch(`${BEDS24_API_BASE}/bookings?${query}`, {
    headers: { token: accessToken },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Beds24 GET /bookings failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: Beds24Booking[] };
  const booking = body.data?.find((b) => String(b.id) === bookingId);
  // propertyId で絞り込んでいるが、他物件の予約を紐付けないよう念のため確認
  return booking && String(booking.propertyId) === beds24PropertyId ? booking : null;
}

type Beds24InvoiceItem = {
  type?: string; // 'charge' | 'payment'
  qty?: number;
  amount?: number;
  lineTotal?: number;
};

// 請求項目（invoiceItems）の支払い合計が請求合計に達していれば支払い済みとする。
// 請求項目が登録されていない予約は、予約金額（price）を請求額とみなす。
// 予約が見つからなければ null（判定不能。呼び出し側で is_paid を変更しない）
export async function fetchBeds24PaymentStatus(
  propertyId: string,
  beds24PropertyId: string,
  bookingId: string,
): Promise<boolean | null> {
  const token = await getBeds24AccessToken(propertyId);
  const query = new URLSearchParams({
    id: bookingId,
    propertyId: beds24PropertyId,
    includeInvoiceItems: "true",
  });
  const res = await fetch(`${BEDS24_API_BASE}/bookings?${query}`, {
    headers: { token },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Beds24 GET /bookings invoice items failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data?: Array<{ id: number; propertyId: number; price?: number; invoiceItems?: Beds24InvoiceItem[] }>;
  };
  const booking = body.data?.find(
    (item) => String(item.id) === bookingId && String(item.propertyId) === beds24PropertyId,
  );
  if (!booking) return null;

  const lineTotal = (item: Beds24InvoiceItem) =>
    Number(item.lineTotal ?? (item.qty ?? 1) * (item.amount ?? 0)) || 0;
  const items = booking.invoiceItems ?? [];
  const charges = items.filter((item) => item.type === "charge");
  const charged = charges.length
    ? charges.reduce((sum, item) => sum + lineTotal(item), 0)
    : Number(booking.price ?? 0);
  const paid = items
    .filter((item) => item.type === "payment")
    .reduce((sum, item) => sum + lineTotal(item), 0);
  // 0円予約は支払い済みと判定しない（料金未設定の予約で鍵番号が出ないようにする）
  return charged > 0 && paid >= charged;
}

export async function getBeds24LockCode(
  propertyId: string,
  beds24PropertyId: string,
  bookingId: string,
): Promise<string> {
  const token = await getBeds24AccessToken(propertyId);
  const query = new URLSearchParams({
    id: bookingId,
    propertyId: beds24PropertyId,
    includeInfoItems: "true",
  });
  const res = await fetch(`${BEDS24_API_BASE}/bookings?${query}`, {
    headers: { token },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Beds24 GET /bookings lock details failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as {
    data?: Array<{
      id: number;
      propertyId: number;
      doorCode?: unknown;
      lockCode?: unknown;
      keyCode?: unknown;
      infoItems?: Array<{ name?: string; value?: unknown }>;
      custom?: Record<string, unknown>;
    }>;
  };
  const booking = body.data?.find(
    (item) => String(item.id) === bookingId && String(item.propertyId) === beds24PropertyId,
  );
  if (!booking) throw new Error("Beds24 booking was not found for lock-code lookup");

  const configuredField = process.env.BEDS24_LOCK_CODE_FIELD?.trim().toLowerCase();
  const infoItem = booking.infoItems?.find((item) => {
    const name = item.name?.trim().toLowerCase() ?? "";
    return configuredField ? name === configuredField : /door|lock|key|鍵|暗証番号/.test(name);
  })?.value;
  const customValue = configuredField ? booking.custom?.[configuredField] : undefined;
  const value = booking.doorCode ?? booking.lockCode ?? booking.keyCode ?? infoItem ?? customValue;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Beds24 did not return a lock code; configure the lock code as a booking info item");
  }
  const lockCode = String(value).trim();
  if (!lockCode || lockCode.length > 200) throw new Error("Beds24 returned an invalid lock code");
  return lockCode;
}
