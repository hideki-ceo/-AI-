import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/components/lp/site";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-noto-sans-jp",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "民泊",
    "民泊 自動応答",
    "民泊 宿泊者名簿 自動化",
    "民泊新法 定期報告 システム",
    "Beds24 チェックイン 自動化",
    "パスポート保管 管理システム",
    "民泊 AI",
    "民泊 ゲスト対応",
    "民泊 多言語対応",
    "Beds24",
    "Beds24 連携",
    "LINE 自動応答",
    "LINE Messaging API",
    "AIチャットボット",
    "Gemini",
    "バケーションレンタル",
    "宿泊施設 問い合わせ 自動化",
  ],
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // og:image は src/app/opengraph-image.tsx から自動生成される
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={notoSansJp.variable}>
      <body className="bg-white font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
