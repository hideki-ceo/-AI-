import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const LINE_API_BASE = "https://api.line.me/v2/bot";
// LINE のテキストメッセージ上限
const MAX_TEXT_LENGTH = 5000;

// https://developers.line.biz/ja/reference/messaging-api/#webhook-event-objects
export type LineWebhookEvent = {
  type: string;
  mode: "active" | "standby";
  timestamp: number;
  webhookEventId: string;
  replyToken?: string;
  source?: { type: "user" | "group" | "room"; userId?: string };
  message?: { id: string; type: string; text?: string };
  deliveryContext?: { isRedelivery: boolean };
};

export type LineWebhookBody = {
  destination: string;
  events: LineWebhookEvent[];
};

// 1対1トークのテキストメッセージ（AI 応答の対象）
export type GuestTextEvent = LineWebhookEvent & {
  replyToken: string;
  source: { type: "user"; userId: string };
  message: { id: string; type: "text"; text: string };
};

export function isGuestTextEvent(event: LineWebhookEvent): event is GuestTextEvent {
  return (
    event.type === "message" &&
    event.mode === "active" &&
    event.message?.type === "text" &&
    !!event.message.text &&
    event.source?.type === "user" &&
    !!event.source.userId &&
    !!event.replyToken
  );
}

// 友だち追加（ブロック解除を含む）
export type GuestFollowEvent = LineWebhookEvent & {
  type: "follow";
  replyToken: string;
  source: { type: "user"; userId: string };
};

export function isGuestFollowEvent(event: LineWebhookEvent): event is GuestFollowEvent {
  return (
    event.type === "follow" &&
    event.mode === "active" &&
    event.source?.type === "user" &&
    !!event.source.userId &&
    !!event.replyToken
  );
}

// x-line-signature =base64(HMAC-SHA256(channelSecret, 生のリクエストボディ))
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest();
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function callLineApi(
  path: string,
  accessToken: string,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const res = await fetch(`${LINE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  // 409 = 同じ retry key で送信済み（push の再試行時）
  if (!res.ok && res.status !== 409) {
    throw new Error(`LINE API ${path} failed: ${res.status} ${await res.text()}`);
  }
}

function textMessages(text: string) {
  return [{ type: "text", text: text.slice(0, MAX_TEXT_LENGTH) }];
}

// basicId（@xxxx）は oaMessage URL の生成に使う。チャネルアクセストークンの検証も兼ねる
export async function getBotInfo(
  accessToken: string,
): Promise<{ basicId: string; displayName: string }> {
  const res = await fetch(`${LINE_API_BASE}/info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`LINE API /info failed: ${res.status} ${await res.text()}`);
  }
  const { basicId, displayName } = (await res.json()) as { basicId: string; displayName: string };
  return { basicId, displayName };
}

// LINE Developers の「Webhook URL」を API で設定する（https のみ受け付けられる）
export async function setWebhookEndpoint(accessToken: string, endpoint: string) {
  const res = await fetch(`${LINE_API_BASE}/channel/webhook/endpoint`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`LINE API set webhook endpoint failed: ${res.status} ${await res.text()}`);
  }
}

// LINE Developers に設定されている Webhook URL と「Webhookの利用」の ON/OFF
export async function getWebhookEndpoint(
  accessToken: string,
): Promise<{ endpoint: string; active: boolean }> {
  const res = await fetch(`${LINE_API_BASE}/channel/webhook/endpoint`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`LINE API get webhook endpoint failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { endpoint: string; active: boolean };
}

// LINE から設定済みの Webhook URL に空のイベントを送らせ、署名検証まで通るか確認する
export async function testWebhookEndpoint(
  accessToken: string,
): Promise<{ success: boolean; statusCode: number; reason: string; detail: string }> {
  const res = await fetch(`${LINE_API_BASE}/channel/webhook/test`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`LINE API webhook test failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { success: boolean; statusCode: number; reason: string; detail: string };
}

// ゲストの LINE で公式アカウントのトークを開き、text を入力済みにする URL
export function oaMessageUrl(basicId: string, text: string): string {
  return `https://line.me/R/oaMessage/${encodeURIComponent(basicId)}/?${encodeURIComponent(text)}`;
}

// reply token は受信から約1分で失効し、1回しか使えない
export function replyText(accessToken: string, replyToken: string, text: string) {
  return callLineApi("/message/reply", accessToken, { replyToken, messages: textMessages(text) });
}

// retryKey (UUID) を渡すと、同じキーでの再送が二重配信されない
export function pushText(accessToken: string, to: string, text: string, retryKey?: string) {
  return callLineApi(
    "/message/push",
    accessToken,
    { to, messages: textMessages(text) },
    retryKey ? { "X-Line-Retry-Key": retryKey } : {},
  );
}
