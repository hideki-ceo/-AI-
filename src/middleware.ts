import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// 公開 LP とクローラー向けファイルはログイン不要なのでセッション更新をしない
const PUBLIC_PATHS = new Set(["/", "/robots.txt", "/sitemap.xml", "/opengraph-image"]);

export async function middleware(request: NextRequest) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  // 静的ファイル、外部 Webhook（LINE / Stripe）、定期実行、ゲスト向け予約リンク（/l/...）はセッション不要なので除外
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|l/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
