import { SectionHeading } from "./SectionHeading";

const STATS = [
  { value: "10", unit: "名まで", label: "予約ごとの宿泊者情報を登録", note: "" },
  { value: "5", unit: "分", label: "パスポート閲覧URLの有効期限", note: "" },
  { value: "2", unit: "か月ごと", label: "民泊新法の定期報告期間", note: "" },
];

const BENEFITS = [
  {
    title: "未回収のまま鍵を渡さない",
    body: "決済と名簿を機械的に照合し、必要情報が欠けている間は鍵番号の案内を止めます。スタッフの確認漏れに頼らない運用へ。",
  },
  {
    title: "パスポートを非公開で保管",
    body: "画像を非公開ストレージに保存。閲覧時のみ管理者・物件オーナー向けの5分間URLを発行します。",
  },
  {
    title: "定期報告を数字で確認",
    body: "対象期間のゲスト泊数・国籍別の人数と泊数・営業日数を物件単位で集計し、報告準備の手間を減らします。",
  },
];

export function Benefits() {
  return (
    <section id="benefits" className="bg-gradient-to-br from-brand-100 to-brand-200 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading eyebrow="Benefits" title="導入で変わる、民泊運営のこれから" />
        <dl className="mt-14 grid gap-5 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white p-7 text-center shadow-sm ring-1 ring-brand-200">
              <dt className="text-sm text-slate-600">
                {s.label}
                {s.note && <span className="ml-0.5 text-xs text-slate-400">{s.note}</span>}
              </dt>
              <dd className="mt-3 text-brand-700">
                <span className="text-5xl font-bold">{s.value}</span>
                <span className="ml-1 text-lg font-semibold">{s.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title}>
              <h3 className="text-lg font-bold text-ink">{b.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
