import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "ログイン", robots: { index: false, follow: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  // 外部サイトへのリダイレクトを防ぐため、サイト内のパスだけを受け付ける
  const redirectTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard/bookings";
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-ink">ログイン</h1>
        {(error === "reset-link" || error === "confirm-link") && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error === "reset-link"
              ? "再設定リンクが無効か、有効期限が切れています。もう一度再設定メールを送信してください。"
              : "確認リンクが無効か、有効期限が切れています。登録または再設定のメールを再送してください。"}
          </p>
        )}
        <LoginForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}
