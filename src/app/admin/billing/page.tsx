import { redirect } from "next/navigation";
import { AdminBillingClient } from "@/components/admin/AdminBillingClient";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminBillingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/");
  const { data: profile, error } = await createAdminClient()
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (error || profile.role !== "admin") redirect("/");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-ink">課金免除の管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          無料テナントと管理委託契約物件の課金免除を設定できます。変更はStripeの物件数にも同期されます。
        </p>
        <AdminBillingClient />
      </div>
    </main>
  );
}
