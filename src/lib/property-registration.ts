import "server-only";
import {
  exchangeBeds24InviteCode,
  listBeds24Properties,
  refreshBeds24AccessToken,
} from "@/lib/beds24";
import { getBotInfo, setWebhookEndpoint, testWebhookEndpoint } from "@/lib/line";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReplyMode } from "@/types/database";

// 物件の登録（外部 API の認証情報の検証 → properties / property_secrets の作成）。
// Stripe の料金プラン同期は含まない。物件登録後、呼び出し側で同期すること。

export type RegisterPropertyInput = {
  ownerId: string;
  propertyName: string;
  beds24PropertyId: string;
  // 招待コード（1回限り）か、交換済みの refresh token のどちらか
  beds24: { inviteCode: string } | { refreshToken: string };
  lineChannelAccessToken: string;
  lineChannelSecret: string;
  houseRulesText?: string | null;
  replyMode?: ReplyMode;
};

export type RegisteredProperty = {
  propertyId: string;
  lineBotName: string;
  beds24PropertyName: string;
  webhookUrl: string;
  // Beds24 の予約確認メールテンプレートに貼るリンク（[BOOKID] は Beds24 のテンプレート変数）
  bookingLinkTemplate: string;
};

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  return url.replace(/\/+$/, "");
}

export function lineWebhookUrl(propertyId: string): string {
  return `${appUrl()}/api/webhooks/line/${propertyId}`;
}

export async function registerProperty(input: RegisterPropertyInput): Promise<RegisteredProperty> {
  // Beds24 の招待コードは1回限りなので、先に LINE の認証情報を確認する
  const bot = await getBotInfo(input.lineChannelAccessToken).catch((err) => {
    throw new Error(`LINE チャネルアクセストークンを確認できません: ${err.message}`);
  });

  const usesInviteCode = "inviteCode" in input.beds24;
  const beds24 = await ("inviteCode" in input.beds24
    ? exchangeBeds24InviteCode(input.beds24.inviteCode)
    : refreshBeds24AccessToken(input.beds24.refreshToken)
  ).catch((err) => {
    throw new Error(
      usesInviteCode
        ? `Beds24 招待コードを交換できません（使用済み・期限切れの可能性）: ${err.message}`
        : `Beds24 refresh token で認証できません: ${err.message}`,
    );
  });
  const beds24Properties = await listBeds24Properties(beds24.accessToken);
  const beds24Property = beds24Properties.find((p) => String(p.id) === input.beds24PropertyId);
  if (!beds24Property) {
    const available = beds24Properties.map((p) => `${p.id} (${p.name})`).join(", ") || "なし";
    throw new Error(
      `Beds24 物件 ID ${input.beds24PropertyId} がこのアカウントにありません。利用可能: ${available}。` +
        (usesInviteCode ? "招待コードは使用済みになったため、再登録には新しい招待コードが必要です。" : ""),
    );
  }

  const supabase = createAdminClient();
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .insert({
      user_id: input.ownerId,
      tenant_id: input.ownerId,
      property_name: input.propertyName,
      name: input.propertyName,
      address: "",
      beds24_property_id: input.beds24PropertyId,
      house_rules_text: input.houseRulesText ?? null,
      reply_mode: input.replyMode ?? "approval",
      line_basic_id: bot.basicId,
    })
    .select("id")
    .single();
  if (propertyError) throw new Error(`物件を作成できません: ${propertyError.message}`);

  const { error: secretsError } = await supabase.from("property_secrets").insert({
    property_id: property.id,
    beds24_refresh_token: beds24.refreshToken,
    beds24_access_token: beds24.accessToken,
    beds24_access_token_expires_at: beds24.expiresAt,
    line_channel_access_token: input.lineChannelAccessToken,
    line_channel_secret: input.lineChannelSecret,
  });
  if (secretsError) {
    // 認証情報のない物件を残さない
    await supabase.from("properties").delete().eq("id", property.id);
    throw new Error(`認証情報を保存できません: ${secretsError.message}`);
  }

  return {
    propertyId: property.id,
    lineBotName: bot.displayName,
    beds24PropertyName: beds24Property.name,
    webhookUrl: lineWebhookUrl(property.id),
    bookingLinkTemplate: `${appUrl()}/l/${property.id}/[BOOKID]`,
  };
}

export type WebhookSetupResult =
  | { status: "ok" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

// LINE 側の Webhook URL を設定し、テスト送信で署名検証まで通ることを確認する。
// LINE は https の公開 URL しか受け付けないため、localhost では skipped を返す。
export async function configureLineWebhook(
  propertyId: string,
  lineChannelAccessToken: string,
): Promise<WebhookSetupResult> {
  const url = lineWebhookUrl(propertyId);
  if (!url.startsWith("https://") || /\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    return { status: "skipped", reason: `公開された https の URL ではありません: ${url}` };
  }

  await setWebhookEndpoint(lineChannelAccessToken, url);
  const test = await testWebhookEndpoint(lineChannelAccessToken);
  return test.success
    ? { status: "ok" }
    : { status: "failed", reason: `HTTP ${test.statusCode} ${test.reason} ${test.detail}`.trim() };
}
