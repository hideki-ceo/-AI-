import { SectionHeading } from "./SectionHeading";

const FEATURES = [
  {
    tag: "決済・名簿完了ゲート",
    title: "決済と全員分の名簿が揃うまで、鍵番号をブロック",
    body: "予約人数と提出人数を照合し、必要なパスポート情報と画像まで確認。Stripeで決済が有効、または無料・免除対象であり、かつゲスト情報が全員分完了するまで鍵番号を送信しません。",
    points: ["未提出ゲストが1名でもいれば案内を保留", "Beds24予約情報・Stripe決済状態を連携", "管理委託物件・無料テナントは課金免除"],
  },
  {
    tag: "名簿・パスポート管理",
    title: "最大10名分をスマートフォンから提出",
    body: "予約ごとの専用フォームで、氏名・住所・性別・電話番号・国籍を入力。日本国籍以外のゲストには旅券番号とパスポート画像を必須にします。画像は非公開バケットにランダムUUID名で保管します。",
    points: ["予約人数に合わせた入力欄", "画像は管理者権限でのみ閲覧", "ダウンロードURLは5分で失効"],
  },
  {
    tag: "法令対応レポート",
    title: "月次名簿と、民泊新法の2か月ごとの集計",
    body: "宿泊者名簿をCSVで出力し、定期報告に必要な宿泊日数・国籍別人数・営業日数を2か月単位で集計。期間を選んで物件ごとの状況を確認できます。",
    points: ["氏名・住所・性別・電話番号・国籍・旅券番号を出力", "偶数月単位の報告期間", "物件別の宿泊者数・宿泊日数・営業日数"],
  },
];

export function Features() {
  return (
    <section id="features" className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Features"
          title="名簿回収から報告まで、民泊運営を一気通貫で"
          description="Beds24・Stripeと連携し、ゲスト情報の回収と鍵番号の案内、法令対応レポートをひとつにまとめます。"
        />
        <div className="mt-16 space-y-8">
          {FEATURES.map((f, i) => (
            <article
              key={f.tag}
              className="grid gap-8 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200 sm:p-10 md:grid-cols-[auto_1fr]"
            >
              <p className="text-5xl font-bold text-brand-200 sm:text-6xl" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </p>
              <div>
                <p className="text-sm font-semibold text-brand-600">{f.tag}</p>
                <h3 className="mt-2 text-xl font-bold leading-snug text-ink sm:text-2xl">{f.title}</h3>
                <p className="mt-4 leading-relaxed text-slate-600">{f.body}</p>
                <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                  {f.points.map((point) => (
                    <li key={point} className="flex gap-2 rounded-xl bg-brand-50 p-3 text-sm text-slate-700">
                      <CheckIcon />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 fill-brand-600" aria-hidden="true">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0z" />
    </svg>
  );
}
