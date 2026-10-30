import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-8">
          <DashboardNav />
          <form action="/auth/signout" method="post">
            <button className="rounded-md px-3 py-2 text-sm text-slate-600 hover:text-ink">ログアウト</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 print:p-0">{children}</main>
    </div>
  );
}
