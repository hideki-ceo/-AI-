import { redirect } from "next/navigation";
import { ComplianceReportClient } from "@/components/dashboard/ComplianceReportClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "定期報告", robots: { index: false, follow: false } };

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/dashboard/reports");

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (profileError) throw new Error(`Unable to load profile: ${profileError.message}`);

  // admin（ソアリング合同会社）は全物件、オーナーは自分の物件のみ
  let query = admin.from("properties").select("id, name, minpaku_registration_no").order("name");
  if (profile.role !== "admin") query = query.eq("user_id", data.user.id);
  const { data: properties, error } = await query;
  if (error) throw new Error(`Unable to load properties: ${error.message}`);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">民泊新法 定期報告</h1>
      <p className="mt-2 text-sm text-slate-600 print:hidden">
        2か月ごとの宿泊日数・宿泊者数・延べ宿泊者数・国籍別の内訳を集計します。民泊制度運営システムへの報告にお使いください。
      </p>
      <ComplianceReportClient properties={properties} />
    </div>
  );
}
