import { SIGNUP_URL } from "./site";

const BADGES = ["Beds24・Stripe連携", "決済と名簿完了まで鍵番号をブロック", "パスポート画像を非公開保管"];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white pt-28 pb-20 sm:pt-36 sm:pb-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-brand-200/40 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            民泊オーナー・住宅宿泊管理業者向け
          </p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-ink sm:text-5xl sm:leading-tight">
            鍵番号を人質にする。
            <br className="hidden sm:block" />
            名簿が揃うまで、
            <span className="text-brand-600">渡さない。</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Stripe決済と、予約人数分すべての宿泊者名簿・必要なパスポート提出を確認してから鍵番号を案内。
            Beds24連携で、未回収のままチェックインされる問題を仕組みで防ぎます。
          </p>
          <ul className="mt-7 flex flex-wrap gap-2" aria-label="主な特徴">
            {BADGES.map((badge) => (
              <li
                key={badge}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200"
              >
                {badge}
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href={SIGNUP_URL}
              className="rounded-full bg-brand-600 px-7 py-3.5 text-center font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700"
            >
              サブスクに申し込む
            </a>
            <a
              href="#features"
              className="rounded-full border border-slate-300 bg-white px-7 py-3.5 text-center font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700"
            >
              機能を詳しく見る
            </a>
          </div>
        </div>

        <LockGateMock />
      </div>
    </section>
  );
}

function LockGateMock() {
  return (
    <div className="mx-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-8" aria-label="決済・名簿の確認後に鍵番号を案内">
      <div className="flex items-center justify-between border-b border-slate-100 pb-5">
        <div>
          <p className="text-sm font-bold text-ink">チェックイン準備状況</p>
          <p className="mt-1 text-xs text-slate-500">Beds24 予約 #482610</p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">確認中</span>
      </div>
      <div className="mt-5 space-y-3">
        <GateStatus label="Stripe決済" status="完了" done />
        <GateStatus label="宿泊者名簿" status="10 / 10 名提出済み" done />
        <GateStatus label="パスポート画像" status="必要なゲスト分を確認済み" done />
      </div>
      <div className="mt-6 rounded-xl bg-brand-50 p-4 text-center">
        <p className="text-xs font-semibold text-brand-700">すべての条件を確認しました</p>
        <p className="mt-1 text-sm font-bold text-ink">鍵番号をEmail・LINEで自動案内</p>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">どれか1つでも未完了なら、鍵番号は送信されません。</p>
    </div>
  );
}

function GateStatus({ label, status, done }: { label: string; status: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{status}</p>
      </div>
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
        {done ? "✓" : "…"}
      </span>
    </div>
  );
}

// LINE のトーク画面を模したイメージ（装飾）。言語ごとに別のゲストとのトークとして2画面に分ける
function ChatMock() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="grid grid-cols-2 items-start gap-3 sm:gap-5">
        <Phone language="English" time="2:14 AM">
          <Bubble side="guest" initial="E">
            Hi! What time can we check in tomorrow? Our flight lands at 10pm.
          </Bubble>
          <Bubble side="ai">
            Hello Emma! Your booking for 3 guests on Nov 12 is confirmed. Self check-in is available until midnight,
            so arriving after 10 PM is no problem 😊
          </Bubble>
        </Phone>
        <div className="mt-12">
          <Phone language="中文" time="23:40">
            <Bubble side="guest" initial="李">
              请问附近有便利店吗？
            </Bubble>
            <Bubble side="ai">有的！步行约2分钟就有一家7-Eleven，24小时营业。</Bubble>
            <Bubble side="guest" initial="李">
              谢谢！可以寄存行李吗？
            </Bubble>
            <Bubble side="ai">我确认后再联系您，请稍等。</Bubble>
          </Phone>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 rounded-xl bg-white px-4 py-3 text-xs shadow-xl ring-1 ring-slate-200 sm:-left-10">
        <p className="font-semibold text-ink">返信までの時間</p>
        <p className="mt-0.5 text-2xl font-bold text-brand-600">数秒</p>
      </div>
    </div>
  );
}

function Phone({ language, time, children }: { language: string; time: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-center text-xs font-semibold text-slate-500">{language}</p>
      <div className="rounded-[1.6rem] bg-ink p-2 shadow-2xl shadow-ink/30">
        <div className="overflow-hidden rounded-[1.2rem] bg-[#8cabd9]">
          <div className="flex items-center justify-between bg-ink/90 px-3 py-2.5 text-[10px] text-white">
            <span className="truncate font-semibold">Kyoto Machiya Stay</span>
            <span className="ml-1 rounded bg-line px-1 py-0.5 text-[9px] font-bold">LINE</span>
          </div>
          <div className="space-y-2.5 px-2 py-3 text-[11px] leading-relaxed sm:text-xs">
            <p className="text-center text-[9px] text-white/80">{time}</p>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ゲストの質問は白・左、AIの返信は緑・右
function Bubble({ side, initial, children }: { side: "guest" | "ai"; initial?: string; children: React.ReactNode }) {
  return side === "guest" ? (
    <div className="flex items-start gap-1">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-[9px] font-bold text-slate-600">
        {initial}
      </span>
      <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-2.5 py-1.5 text-ink">{children}</p>
    </div>
  ) : (
    <div className="flex flex-col items-end">
      <p className="max-w-[88%] rounded-2xl rounded-tr-sm bg-[#a6e675] px-2.5 py-1.5 text-ink">{children}</p>
      <span className="mt-0.5 text-[9px] text-white/90">AI自動応答</span>
    </div>
  );
}
