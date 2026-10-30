import { BASE_PRICE_JPY } from "@/lib/billing";
import { FAQ_ITEMS } from "./faq-data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

const softwareApplication = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "民泊・バケーションレンタル向けゲスト対応自動化SaaS",
  operatingSystem: "Web",
  inLanguage: "ja",
  featureList: [
    "Beds24とStripeの連携による予約・決済自動同期",
    "全ゲストの宿泊者名簿とパスポート提出確認後にのみ鍵番号を案内",
    "パスポート画像の非公開ストレージ保管",
    "最大10名分のモバイル宿泊者情報フォーム",
    "民泊新法の定期報告向け集計",
    "LINE Messaging APIによるゲストへの自動応答",
    "Gemini AIによる多言語の自動判別・返信",
    "返信の日本語訳表示",
    "緊急・苦情・キャンセル等の要対応メッセージ判定",
    "緊急時・クレーム用の連絡先（LINE通話・電話番号）登録",
    "1アカウント最大5物件のマルチテナント管理",
  ],
  offers: {
    "@type": "Offer",
    name: "1物件あたりの月額利用料（税込）",
    price: BASE_PRICE_JPY,
    priceCurrency: "JPY",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: BASE_PRICE_JPY,
      priceCurrency: "JPY",
      unitText: "物件・月",
      valueAddedTaxIncluded: true,
    },
  },
};

const faqPage = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

// "<" をエスケープして </script> による埋め込み破壊を防ぐ
const serialize = (data: object) => JSON.stringify(data).replace(/</g, "\\u003c");

export function JsonLd() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialize(softwareApplication) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialize(faqPage) }} />
    </>
  );
}
