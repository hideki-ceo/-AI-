import { redirect } from "next/navigation";
import { SignupForm } from "@/components/SignupForm";
import { BASE_PRICE_JPY } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "サブスクのお申し込み", robots: { index: false, follow: false } };

export default async function SignupPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard/settings");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <h1 className="text-2xl font-bold text-ink">サブスクのお申し込み</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          アカウントを作成後、管理物件と連携情報を登録し、Stripeで月額利用を開始できます。
        </p>
        <div className="mt-5 rounded-lg bg-brand-50 p-4">
          <p className="font-semibold text-ink">
            1物件あたり月額 {BASE_PRICE_JPY.toLocaleString("ja-JP")}円（税込）
          </p>
          <p className="mt-1 text-sm text-slate-600">登録する物件数に応じて月額料金が決まります。</p>
        </div>
        <SignupForm />
      </div>
    </main>
  );
}
