import Link from "next/link";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const metadata = { title: "パスワード再設定", robots: { index: false, follow: false } };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-ink">パスワード再設定</h1>
        {error === "reset-link" ? (
          <div className="mt-4 space-y-4">
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              再設定リンクが無効か、有効期限が切れています。ログイン画面から再設定メールを送り直してください。
            </p>
            <Link href="/login" className="block text-center text-sm text-brand-700 hover:underline">
              ログイン画面に戻る
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">新しいパスワードを設定してください（8文字以上）。</p>
            <ResetPasswordForm />
          </>
        )}
      </div>
    </main>
  );
}
