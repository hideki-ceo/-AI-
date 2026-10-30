// 管理画面ができるまでの物件登録用 CLI。
//   npm run property:register -- --owner-email you@example.com --name "物件名" --beds24-property-id 123456 [--house-rules-file rules.txt] [--reply-mode auto]
// 招待コード・LINE の認証情報はシェル履歴に残らないよう、引数ではなく対話入力で受け取る。
// .env.local の BEDS24_REFRESH_TOKEN / BEDS24_PROPERTY_ID / LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET
// が設定されていれば、それを使って入力を省略する。
import "./websocket-polyfill";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { requiresBilling } from "@/lib/billing";
import { configureLineWebhook, registerProperty } from "@/lib/property-registration";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const { values } = parseArgs({
    options: {
      "owner-email": { type: "string" },
      name: { type: "string" },
      "beds24-property-id": { type: "string" },
      "house-rules-file": { type: "string" },
      "reply-mode": { type: "string", default: "approval" },
    },
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (label: string, given?: string) => {
    if (given) return given;
    const answer = (await rl.question(`${label}: `)).trim();
    if (!answer) throw new Error(`${label} は必須です`);
    return answer;
  };

  const replyMode = values["reply-mode"];
  if (replyMode !== "auto" && replyMode !== "approval") {
    throw new Error("--reply-mode は auto か approval");
  }

  const ownerEmail = await ask("オーナーのメールアドレス", values["owner-email"]);
  const supabase = createAdminClient();
  const { data: owner, error } = await supabase
    .from("profiles")
    .select("id, is_internal_free")
    .eq("email", ownerEmail)
    .maybeSingle();
  if (error) throw new Error(`profiles を読めません: ${error.message}`);
  if (!owner) {
    throw new Error(
      `${ownerEmail} のユーザーがいません。Supabase の Authentication > Users で先にユーザーを作成してください`,
    );
  }
  // Stripe quantity 同期が未実装のため、課金対象ユーザーへの追加は Server Action の実装まで行わない
  if (requiresBilling(owner)) {
    throw new Error(
      "このユーザーは is_internal_free = false です。Stripe 連携の実装までは無料アカウントにのみ登録できます",
    );
  }

  const propertyName = await ask("物件名", values.name);
  const fromEnv = (key: string) => process.env[key]?.trim() || undefined;
  const beds24PropertyId = await ask(
    "Beds24 物件 ID",
    values["beds24-property-id"] ?? fromEnv("BEDS24_PROPERTY_ID"),
  );
  const houseRulesText = values["house-rules-file"]
    ? await readFile(values["house-rules-file"], "utf8")
    : null;
  const lineChannelAccessToken = await ask(
    "LINE チャネルアクセストークン（長期）",
    fromEnv("LINE_CHANNEL_ACCESS_TOKEN"),
  );
  const lineChannelSecret = await ask("LINE チャネルシークレット", fromEnv("LINE_CHANNEL_SECRET"));
  const beds24RefreshToken = fromEnv("BEDS24_REFRESH_TOKEN");
  const beds24 = beds24RefreshToken
    ? { refreshToken: beds24RefreshToken }
    : { inviteCode: await ask("Beds24 招待コード") };
  rl.close();

  console.log("\n登録中...");
  const registered = await registerProperty({
    ownerId: owner.id,
    propertyName,
    beds24PropertyId,
    beds24,
    lineChannelAccessToken,
    lineChannelSecret,
    houseRulesText,
    replyMode,
  });

  console.log(`✔ 物件を登録しました: ${registered.propertyId}`);
  console.log(`  LINE 公式アカウント: ${registered.lineBotName}`);
  console.log(`  Beds24 物件: ${registered.beds24PropertyName}`);
  console.log(`  返信モード: ${replyMode}`);
  console.log(`  予約確認メール用リンク: ${registered.bookingLinkTemplate}`);

  const webhook = await configureLineWebhook(registered.propertyId, lineChannelAccessToken);
  if (webhook.status === "ok") {
    console.log(`✔ LINE Webhook を設定し、テスト送信に成功しました: ${registered.webhookUrl}`);
  } else {
    console.log(`! LINE Webhook は未設定です（${webhook.reason}）`);
    console.log(`  公開 URL の用意後、LINE Developers で次の URL を設定してください: ${registered.webhookUrl}`);
  }
  console.log("  LINE Developers で「Webhookの利用」ON、「応答メッセージ」「あいさつメッセージ」OFF にしてください");
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
