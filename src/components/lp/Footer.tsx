import { Logo } from "./Header";
import { SITE_NAME } from "./site";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-500 sm:flex-row sm:px-6">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <Logo />
          {SITE_NAME}
        </p>
        <p className="text-xs">
          Beds24はBeds24.com、LINEはLINEヤフー株式会社、GeminiはGoogle LLCの商標または登録商標です。
        </p>
        <p className="text-xs">© {new Date().getFullYear()} {SITE_NAME}</p>
      </div>
    </footer>
  );
}
