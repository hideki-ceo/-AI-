import { SignupForm } from "@/components/SignupForm";

export const metadata = { title: "新規登録", robots: { index: false, follow: false } };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-ink">新規登録</h1>
        <p className="mt-2 text-sm text-slate-600">メールアドレスとパスワードを登録してください。</p>
        <SignupForm />
      </div>
    </main>
  );
}
