import { redirect } from "next/navigation";
import { AiManualForm } from "@/components/dashboard/AiManualForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "AIマニュアル設定", robots: { index: false, follow: false } };

export default async function AiManualSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ propertyId?: string }>;
}) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login?next=/dashboard/settings/ai");

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  if (profileError) throw new Error(`Unable to load account settings: ${profileError.message}`);

  let propertiesQuery = admin
    .from("properties")
    .select("id, user_id, property_name, house_rules_text, prebooking_rules_text")
    .order("property_name");
  if (profile.role !== "admin") {
    propertiesQuery = propertiesQuery.eq("user_id", authData.user.id);
  }

  const { data: properties, error: propertiesError } = await propertiesQuery;
  if (propertiesError) throw new Error(`Unable to load properties: ${propertiesError.message}`);

  const params = (await searchParams) ?? {};
  const requestedId = params.propertyId;
  const selectedId = properties.find((property) => property.id === requestedId)?.id ?? properties[0]?.id ?? "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">AIマニュアル設定</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          物件ごとに、宿泊中のゲスト向けルールと予約前問い合わせ向けルールを設定できます。
          予約前の案内資料をアップロードすると、AIが回答時に参照します。
        </p>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <p className="text-sm text-slate-600">まずは物件を登録してください。登録後、この画面でAIマニュアルを設定できます。</p>
        </div>
      ) : (
        <AiManualForm properties={properties} selectedPropertyId={selectedId} />
      )}
    </div>
  );
}
