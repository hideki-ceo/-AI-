import { BASE_PRICE_JPY } from "@/lib/billing";
import { CheckIcon } from "./Features";
import { SectionHeading } from "./SectionHeading";
import { SIGNUP_URL } from "./site";

const INCLUDED = [
  "Beds24 API連携",
  "Stripe Billingによる自動決済",
  "宿泊者名簿・パスポート提出確認",
  "提出完了までの鍵番号送信ブロック",
  "非公開パスポート画像ストレージ",
  "月次名簿CSV・定期報告集計",
  "ゲストへのEmail・LINE通知",
];

const yen = (n: number) => n.toLocaleString("ja-JP");

export function Pricing() {
  return (
    <section id="pricing" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Pricing"
          title="物件ごとに、わかりやすい月額料金"
          description="管理する物件数に応じたシンプルな定額制。管理委託契約物件・対象テナントはご利用料金が免除されます。"
        />
        <div className="mx-auto mt-14 max-w-3xl rounded-3xl border-2 border-brand-500 p-8 shadow-xl shadow-brand-600/10 sm:p-10">
            <p className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              1物件あたり
            </p>
            <div className="mt-6 text-ink">
              <span className="text-lg">月額</span>
              <span className="mx-2 text-5xl font-bold">¥{yen(BASE_PRICE_JPY)}</span>
              <span className="text-sm text-slate-500">（税込）</span>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-slate-700">
                  <CheckIcon />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-8 rounded-xl bg-brand-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
              例：3物件の場合は月額33,000円（税込）。ソアリング合同会社の無料対象テナントおよび管理委託契約物件は課金対象外です。
            </p>
            <a
              href={SIGNUP_URL}
              className="mt-9 block rounded-full bg-brand-600 py-3.5 text-center font-semibold text-white transition hover:bg-brand-700"
            >
              サブスクに申し込む
            </a>
        </div>
      </div>
    </section>
  );
}
