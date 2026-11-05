import { redirect } from "next/navigation";
import { SignupForm } from "@/components/SignupForm";
import {
  BASE_PRICE_JPY,
  MAX_PROPERTIES_PER_ACCOUNT,
  MULTI_PROPERTY_ADDON_JPY,
  MULTI_PROPERTY_PRICE_JPY,
} from "@/lib/billing";
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
            1アカウント基本料金：月額 {BASE_PRICE_JPY.toLocaleString("ja-JP")}円（税込）
          </p>
          <p className="mt-1 font-semibold text-ink">
            2〜{MAX_PROPERTIES_PER_ACCOUNT}物件：月額 {MULTI_PROPERTY_ADDON_JPY.toLocaleString("ja-JP")}円（税込）を追加
          </p>
          <p className="mt-1 text-sm text-slate-700">
            合計月額 {MULTI_PROPERTY_PRICE_JPY.toLocaleString("ja-JP")}円（税込）
          </p>
          <p className="mt-1 text-sm text-slate-600">
            1アカウント最大{MAX_PROPERTIES_PER_ACCOUNT}物件です。
          </p>
        </div>
        <SignupForm />
      </div>
    </main>
  );
}
