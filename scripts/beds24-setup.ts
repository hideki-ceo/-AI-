// .env.local の BEDS24_INVITE_CODE（1回限り）を refresh token に交換し、
// BEDS24_REFRESH_TOKEN に書き込んで BEDS24_INVITE_CODE を空に戻す。トークンは画面に表示しない。
//   npm run beds24:setup
import { readFile, writeFile } from "node:fs/promises";
import { exchangeBeds24InviteCode, listBeds24Properties } from "@/lib/beds24";

const ENV_FILE = ".env.local";

function setEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
}

async function main() {
  const inviteCode = process.env.BEDS24_INVITE_CODE?.trim();
  if (!inviteCode) {
    throw new Error(`${ENV_FILE} の BEDS24_INVITE_CODE に招待コードを記入してください`);
  }
  if (process.env.BEDS24_REFRESH_TOKEN) {
    console.log("! BEDS24_REFRESH_TOKEN は設定済みです。新しい招待コードで上書きします");
  }

  const credentials = await exchangeBeds24InviteCode(inviteCode);

  let content = await readFile(ENV_FILE, "utf8");
  content = setEnvLine(content, "BEDS24_REFRESH_TOKEN", credentials.refreshToken);
  content = setEnvLine(content, "BEDS24_INVITE_CODE", "");
  await writeFile(ENV_FILE, content, "utf8");
  console.log(`✔ refresh token を ${ENV_FILE} の BEDS24_REFRESH_TOKEN に保存しました`);

  const properties = await listBeds24Properties(credentials.accessToken);
  console.log("  このアカウントの物件（BEDS24_PROPERTY_ID に使う）:");
  for (const p of properties) console.log(`    ${p.id}  ${p.name}`);
  if (properties.length === 0) console.log("    なし（招待コードの権限に properties の read があるか確認）");
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
