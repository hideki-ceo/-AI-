// .env.local の設定と外部サービスへの接続を確認する。
//   npm run check:connections                        すべて
//   npm run check:connections -- beds24 line         サービスを指定（supabase / gemini / beds24 / line / properties）
//   npm run check:connections -- line --send-line    LINE_TEST_USER_ID に実際にテストメッセージを送る
// 未設定のサービスはスキップする（失敗扱いにしない）。
import "./websocket-polyfill";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  getBeds24AccessToken,
  getBeds24Booking,
  listBeds24Properties,
  refreshBeds24AccessToken,
} from "@/lib/beds24";
import { generateConciergeReply } from "@/lib/gemini";
import { getBotInfo, getWebhookEndpoint, pushText } from "@/lib/line";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

const SECTIONS = ["supabase", "gemini", "beds24", "line", "properties"] as const;
type Section = (typeof SECTIONS)[number];
// 登録済み物件の LINE / Beds24 接続確認を行う上限
const MAX_PROPERTIES_TO_CHECK = 20;

const args = process.argv.slice(2);
const sendLine = args.includes("--send-line");
const selected = args.filter((a) => !a.startsWith("--"));
for (const s of selected) {
  if (!SECTIONS.includes(s as Section)) {
    console.error(`不明なサービス: ${s}（${SECTIONS.join(" / ")}）`);
    process.exit(1);
  }
}

let failures = 0;
let skipped = 0;

function env(key: string): string {
  return process.env[key]?.trim() ?? "";
}

async function check(name: string, run: () => Promise<string>) {
  try {
    console.log(`  ✔ ${name}: ${await run()}`);
  } catch (err) {
    failures++;
    // API のエラー JSON は複数行になるので1行に詰める
    const message = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ");
    console.log(`  ✖ ${name}: ${message.slice(0, 300)}`);
  }
}

function warn(message: string) {
  console.log(`  ! ${message}`);
}

async function section(name: Section, requiredEnv: string[], body: () => Promise<void>) {
  if (selected.length > 0 && !selected.includes(name)) return;
  console.log(`\n[${name}]`);
  const missing = requiredEnv.filter((key) => !env(key));
  if (missing.length > 0) {
    skipped++;
    console.log(`  - スキップ（未設定: ${missing.join(", ")}）`);
    return;
  }
  await body();
}

const SUPABASE_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

async function checkSupabase() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
    warn(`NEXT_PUBLIC_SUPABASE_URL がクラウドの形式ではありません: ${url}`);
  }
  if (anonKey === serviceKey || anonKey.startsWith("sb_secret_")) {
    failures++;
    console.log("  ✖ キー: NEXT_PUBLIC_SUPABASE_ANON_KEY に秘密キーが設定されています。ブラウザに公開されるため anon / publishable キーにしてください");
    return;
  }

  const admin = createAdminClient();
  await check("service_role キー", async () => {
    const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true });
    if (error) throw new Error(`${error.message}（キーの誤り、または migrations 未適用: npm run db:push）`);
    return `接続 OK（profiles ${count ?? 0} 件）`;
  });

  await check("migrations", async () => {
    // 最新の migration で追加した列
    const { error } = await admin.from("line_guests").select("link_failure_count").limit(1);
    if (error) throw new Error(`最新の migration が未適用です（npm run db:push）: ${error.message}`);
    return "最新まで適用済み";
  });

  await check("RLS（anon キー）", async () => {
    const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anon.from("property_secrets").select("property_id").limit(1);
    if (!error) {
      throw new Error(`anon キーで property_secrets を読めてしまいます（${data.length} 件）`);
    }
    return "property_secrets は anon から読めない";
  });
}

async function checkGemini() {
  await check(`返答生成（${env("GEMINI_MODEL") || "gemini-2.5-flash"}）`, async () => {
    const reply = await generateConciergeReply({
      propertyName: "接続テスト",
      houseRules: "チェックインは15時から、チェックアウトは10時まで。",
      booking: {
        id: 0,
        status: "confirmed",
        arrival: "2026-11-03",
        departure: "2026-11-05",
        numAdult: 2,
        numChild: 0,
        firstName: "Test",
      },
      history: [],
      message: "What time is check-in?",
    });
    return `OK（言語: ${reply.language}）「${reply.reply.replace(/\s+/g, " ").slice(0, 60)}」`;
  });
}

async function checkBeds24() {
  let accessToken = "";
  await check("refresh token → access token", async () => {
    accessToken = (await refreshBeds24AccessToken(env("BEDS24_REFRESH_TOKEN"))).accessToken;
    return "OK";
  });
  if (!accessToken) return;

  await check("物件一覧", async () => {
    const properties = await listBeds24Properties(accessToken);
    const propertyId = env("BEDS24_PROPERTY_ID");
    const list = properties.map((p) => `${p.id} (${p.name})`).join(", ") || "なし";
    if (!propertyId) return `${properties.length} 件: ${list}。BEDS24_PROPERTY_ID を設定してください`;
    const found = properties.find((p) => String(p.id) === propertyId);
    if (!found) throw new Error(`BEDS24_PROPERTY_ID=${propertyId} がありません。利用可能: ${list}`);
    return `BEDS24_PROPERTY_ID=${propertyId}「${found.name}」を確認`;
  });

  const bookingId = env("BEDS24_TEST_BOOKING_ID");
  if (bookingId && env("BEDS24_PROPERTY_ID")) {
    await check(`予約取得（${bookingId}）`, async () => {
      const booking = await getBeds24Booking(accessToken, env("BEDS24_PROPERTY_ID"), bookingId);
      if (!booking) throw new Error("この物件に該当する予約がありません");
      // ゲストの個人情報は表示しない
      return `status=${booking.status} ${booking.arrival}〜${booking.departure} 大人${booking.numAdult ?? 0} 子ども${booking.numChild ?? 0}`;
    });
  }
}

async function checkLine() {
  const accessToken = env("LINE_CHANNEL_ACCESS_TOKEN");
  if (!/^[0-9a-f]{32}$/.test(env("LINE_CHANNEL_SECRET"))) {
    warn("LINE_CHANNEL_SECRET が32桁の16進数ではありません（チャネルシークレットか確認してください）");
  }

  let ok = false;
  await check("チャネルアクセストークン", async () => {
    const bot = await getBotInfo(accessToken);
    ok = true;
    return `${bot.displayName} (${bot.basicId})`;
  });
  if (!ok) return;

  await check("Webhook 設定", async () => {
    const { endpoint, active } = await getWebhookEndpoint(accessToken);
    if (!endpoint) return "未設定（物件登録時に設定する）";
    return `${endpoint}（Webhookの利用: ${active ? "ON" : "OFF"}）`;
  });

  const testUserId = env("LINE_TEST_USER_ID");
  if (!sendLine) {
    if (testUserId) console.log("  - push 送信テストは --send-line を付けると実行します");
    return;
  }
  if (!/^U[0-9a-f]{32}$/.test(testUserId)) {
    failures++;
    console.log("  ✖ push 送信: LINE_TEST_USER_ID が未設定か形式が違います（U から始まる33文字）");
    return;
  }
  await check("push 送信", async () => {
    await pushText(accessToken, testUserId, `[Minpaku Report] 接続テスト ${new Date().toLocaleString("ja-JP")}`, randomUUID());
    return "送信しました（LINE アプリで受信を確認してください）";
  });
}

// DB に登録済みの物件ごとの認証情報
async function checkRegisteredProperties() {
  const admin = createAdminClient();
  const { data: properties, error } = await admin
    .from("properties")
    .select("id, property_name")
    .order("created_at")
    .limit(MAX_PROPERTIES_TO_CHECK);
  if (error) {
    failures++;
    console.log(`  ✖ 物件一覧: ${error.message}`);
    return;
  }
  if (properties.length === 0) {
    console.log("  - 登録済み物件なし（npm run property:register で登録）");
    return;
  }
  for (const property of properties) {
    await check(`${property.property_name} / LINE`, async () => {
      const { data: secrets, error: secretsError } = await admin
        .from("property_secrets")
        .select("line_channel_access_token")
        .eq("property_id", property.id)
        .single();
      if (secretsError) throw new Error(secretsError.message);
      const bot = await getBotInfo(secrets.line_channel_access_token);
      return `${bot.displayName} (${bot.basicId})`;
    });
    await check(`${property.property_name} / Beds24`, async () => {
      await getBeds24AccessToken(property.id);
      return "access token OK";
    });
  }
}

async function main() {
  await section("supabase", SUPABASE_ENV, checkSupabase);
  await section("gemini", ["GEMINI_API_KEY"], checkGemini);
  await section("beds24", ["BEDS24_REFRESH_TOKEN"], async () => {
    if (env("BEDS24_INVITE_CODE")) {
      warn("BEDS24_INVITE_CODE が残っています。npm run beds24:setup で refresh token に交換してください");
    }
    await checkBeds24();
  });
  await section("line", ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"], checkLine);
  await section("properties", SUPABASE_ENV, checkRegisteredProperties);

  console.log(
    `\n${failures ? `✖ ${failures} 件失敗` : "✔ 失敗なし"}${skipped ? `（${skipped} サービスは未設定のためスキップ）` : ""}`,
  );
  process.exit(failures ? 1 : 0);
}

main();
