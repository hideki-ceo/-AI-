// FAQ「ゲストの予約はどうやって判別しているのですか？」の図解。
// 予約確認メールのリンク → LINE に予約番号入りメッセージ → Beds24 照会 → 予約に合わせて AI が回答
const STEPS = [
  { title: "予約確認メールのリンクをタップ", caption: "Beds24の予約確認メールに、専用リンクを1行追加しておきます。", visual: <EmailVisual /> },
  { title: "LINEが開き、予約番号が入力済みに", caption: "ゲストは送信ボタンを押すだけ。予約番号を手で打つ必要はありません。", visual: <LineVisual /> },
  { title: "Beds24に照会して自動でひも付け", caption: "予約番号でBeds24を確認し、このゲストのLINEと予約を結びつけます。", visual: <MatchVisual /> },
  { title: "予約内容をふまえてAIが回答", caption: "宿泊日・人数などを知ったうえで、そのゲストに合った返事をします。", visual: <ReplyVisual /> },
];

export function BookingFlow() {
  return (
    <figure className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100 sm:p-6">
      <figcaption className="mb-5 text-center text-sm font-bold text-ink">予約がひも付くまでの流れ</figcaption>
      <ol className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative flex flex-col rounded-xl bg-white p-4 shadow-sm ring-1 ring-brand-100">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              <p className="text-sm font-bold leading-snug text-ink">{step.title}</p>
            </div>
            <div className="my-4 flex h-28 items-center justify-center rounded-lg bg-slate-50" aria-hidden="true">
              {step.visual}
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{step.caption}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-lg bg-white px-4 py-3 text-xs leading-relaxed text-slate-600 ring-1 ring-brand-100">
        <span className="font-bold text-brand-700">リンクを使わなかった場合も大丈夫：</span>
        ゲストがLINEで予約番号とチェックイン日を送れば、Beds24の予約内容と照らし合わせて本人確認したうえで結びつけます。
      </p>
    </figure>
  );
}

function EmailVisual() {
  return (
    <div className="w-40 rounded-md bg-white p-2.5 text-[9px] leading-tight shadow ring-1 ring-slate-200">
      <p className="font-bold text-slate-700">✉ ご予約確認 / Booking confirmed</p>
      <div className="mt-1.5 h-1 w-full rounded bg-slate-200" />
      <div className="mt-1 h-1 w-4/5 rounded bg-slate-200" />
      <p className="mt-2 rounded bg-brand-600 px-1.5 py-1 text-center font-bold text-white">
        LINEで問い合わせる 👆
      </p>
    </div>
  );
}

function LineVisual() {
  return (
    <div className="w-40 overflow-hidden rounded-md bg-[#8cabd9] text-[9px] shadow ring-1 ring-slate-200">
      <div className="flex items-center justify-between bg-ink px-2 py-1 text-white">
        <span className="font-semibold">Kyoto Machiya Stay</span>
        <span className="rounded bg-line px-1 text-[8px] font-bold">LINE</span>
      </div>
      <div className="h-8" />
      <div className="flex items-center gap-1 bg-white px-1.5 py-1.5">
        <span className="flex-1 rounded bg-slate-100 px-1.5 py-1 text-slate-700">予約番号 / Booking No: 58213047</span>
        <span className="rounded-full bg-line px-1.5 py-0.5 font-bold text-white">➤</span>
      </div>
    </div>
  );
}

function MatchVisual() {
  return (
    <div className="flex items-center gap-2 text-[9px]">
      <div className="rounded-md bg-white px-2 py-1.5 text-center shadow ring-1 ring-slate-200">
        <p className="font-bold text-line">LINE</p>
        <p className="text-slate-500">ゲスト</p>
      </div>
      <div className="flex flex-col items-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">✓</span>
        <span className="mt-0.5 font-bold text-brand-700">一致</span>
      </div>
      <div className="rounded-md bg-white px-2 py-1.5 shadow ring-1 ring-slate-200">
        <p className="font-bold text-slate-700">Beds24</p>
        <p className="text-slate-500">No. 58213047</p>
        <p className="text-slate-500">11/12〜11/14・3名</p>
      </div>
    </div>
  );
}

function ReplyVisual() {
  return (
    <div className="w-40 space-y-1.5 rounded-md bg-[#8cabd9] p-2 text-[9px] leading-snug shadow ring-1 ring-slate-200">
      <p className="w-4/5 rounded-lg rounded-tl-sm bg-white px-1.5 py-1 text-ink">What time is check-in?</p>
      <p className="ml-auto w-[88%] rounded-lg rounded-tr-sm bg-[#a6e675] px-1.5 py-1 text-ink">
        Hi Emma! For your stay on Nov 12 (3 guests), check-in is from 3 PM.
      </p>
    </div>
  );
}
