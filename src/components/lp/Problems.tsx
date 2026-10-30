import { SectionHeading } from "./SectionHeading";

const PROBLEMS = [
  {
    icon: "📋",
    title: "代表者だけで名簿回収が止まる",
    body: "同行者全員の宿泊者情報を集めきれず、チェックイン直前に個別連絡で追いかけていませんか。",
  },
  {
    icon: "🛂",
    title: "パスポート画像の保管が不安",
    body: "外国籍ゲストの旅券情報・画像を、安全に保管し、必要なときだけ権限を持つ担当者が確認できる仕組みが必要。",
  },
  {
    icon: "📊",
    title: "定期報告の集計が手作業",
    body: "宿泊者数・宿泊日数・国籍別内訳を2か月単位で集計するたび、複数の予約記録を転記している。",
  },
];

export function Problems() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading eyebrow="Problem" title="民泊オーナー・住宅宿泊管理業者の、こんなお悩みありませんか？" />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <article key={p.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-7">
              <p className="text-3xl" aria-hidden="true">
                {p.icon}
              </p>
              <h3 className="mt-4 text-lg font-bold text-ink">{p.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{p.body}</p>
            </article>
          ))}
        </div>
        <p className="mt-12 text-center text-lg font-bold text-ink sm:text-xl">
          「提出をお願いする」運用から、<span className="text-brand-600">提出が揃うまで鍵を渡さない仕組み</span>へ。
        </p>
      </div>
    </section>
  );
}
