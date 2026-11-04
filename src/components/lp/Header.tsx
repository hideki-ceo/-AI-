import { SIGNUP_URL, SITE_NAME } from "./site";

const NAV = [
  { href: "#features", label: "特徴" },
  { href: "#benefits", label: "導入効果" },
  { href: "#pricing", label: "料金" },
  { href: "#faq", label: "よくある質問" },
];

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2 font-bold text-ink">
          <Logo />
          <span className="text-sm sm:text-base">{SITE_NAME}</span>
        </a>
        <nav aria-label="ページ内ナビゲーション" className="hidden md:block">
          <ul className="flex items-center gap-7 text-sm text-slate-600">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="transition hover:text-brand-600">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <a
          href={SIGNUP_URL}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          サブスクに申し込む
        </a>
      </div>
    </header>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-brand-600" />
      <path d="M8 16.5 16 9l8 7.5V24H8z" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="16" cy="18.5" r="2.2" fill="white" />
    </svg>
  );
}
