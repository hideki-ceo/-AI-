import { redirect } from "next/navigation";
import { PropertySetupForm } from "@/components/dashboard/PropertySetupForm";
import { SubscriptionCheckoutButton } from "@/components/dashboard/SubscriptionCheckoutButton";
import {
  BASE_PRICE_JPY,
  MAX_PROPERTIES_PER_ACCOUNT,
  MULTI_PROPERTY_ADDON_JPY,
  MULTI_PROPERTY_PRICE_JPY,
  monthlyPriceJpy,
} from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "物件・連携設定", robots: { index: false, follow: false } };

export default async function PropertySettingsPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login?next=/dashboard/settings");

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, is_internal_free, subscription_status")
    .eq("id", authData.user.id)
    .single();
  if (profileError) throw new Error(`Unable to load account settings: ${profileError.message}`);

  let propertiesQuery = admin
    .from("properties")
    .select("id, user_id, property_name, beds24_property_id, reply_mode, is_exempt_from_billing")
    .order("property_name");
  if (profile.role !== "admin") {
    propertiesQuery = propertiesQuery.eq("user_id", authData.user.id);
  }
  const [propertiesResult, tenantResult] = await Promise.all([
    propertiesQuery,
    admin
      .from("tenants")
      .select("is_free_tier, stripe_subscription_status")
      .eq("id", authData.user.id)
      .single(),
  ]);
  if (propertiesResult.error) throw new Error(`Unable to load property settings: ${propertiesResult.error.message}`);
  if (tenantResult.error) throw new Error(`Unable to load billing settings: ${tenantResult.error.message}`);
  const properties = propertiesResult.data;

  const propertyIds = properties.map((property) => property.id);
  const [secretsResult, guestsResult, profilesResult] = await Promise.all([
    propertyIds.length
      ? admin.from("property_secrets").select("property_id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? admin.from("line_guests").select("property_id, linked_at").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    profile.role === "admin"
      ? admin.from("profiles").select("id, email, is_internal_free").order("email")
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [secretsResult, guestsResult, profilesResult]) {
    if (result.error) throw new Error(`Unable to load integration status: ${result.error.message}`);
  }

  const configuredIds = new Set((secretsResult.data ?? []).map((secret) => secret.property_id));
  const linkedCounts = new Map<string, number>();
  for (const guest of guestsResult.data ?? []) {
    if (guest.linked_at) linkedCounts.set(guest.property_id, (linkedCounts.get(guest.property_id) ?? 0) + 1);
  }
  const ownerEmails = new Map((profilesResult.data ?? []).map((owner) => [owner.id, owner.email]));
  const ownerIds = (profilesResult.data ?? []).map((owner) => owner.id);
  const ownerTenantsResult = ownerIds.length
    ? await admin.from("tenants").select("id, is_free_tier").in("id", ownerIds)
    : { data: [], error: null };
  if (ownerTenantsResult.error) throw new Error(`Unable to load owner billing settings: ${ownerTenantsResult.error.message}`);
  const freeTenantIds = new Set((ownerTenantsResult.data ?? []).filter((tenant) => tenant.is_free_tier).map((tenant) => tenant.id));
  const ownerPropertyCounts = new Map<string, number>();
  for (const property of properties) {
    ownerPropertyCounts.set(property.user_id, (ownerPropertyCounts.get(property.user_id) ?? 0) + 1);
  }
  const ownerOptions = (profilesResult.data ?? []).map((owner) => ({
    id: owner.id,
    email: owner.email,
    billingExempt: owner.is_internal_free || freeTenantIds.has(owner.id),
    propertyCount: ownerPropertyCounts.get(owner.id) ?? 0,
  }));
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const myProperties = properties.filter((property) => property.user_id === authData.user.id);
  const propertyCount = myProperties.length;
  const billablePropertyCount = myProperties.filter((property) => !property.is_exempt_from_billing).length;
  const monthlyPrice = billablePropertyCount <= MAX_PROPERTIES_PER_ACCOUNT
    ? monthlyPriceJpy(billablePropertyCount)
    : null;
  const billingExempt = profile.is_internal_free || tenantResult.data.is_free_tier;
  const subscriptionActive =
    profile.subscription_status === "active" ||
    tenantResult.data.stripe_subscription_status === "active";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">物件・連携設定</h1>
        <p className="mt-2 text-sm text-slate-600">
          Beds24とLINEを安全に接続し、予約・ゲスト連携・鍵番号送信を設定します。
          {profile.role === "admin" ? " 管理者として全オーナーの物件を確認できます。" : ""}
        </p>
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <h2 className="mb-5 text-lg font-semibold text-ink">登録済みの物件</h2>
        {properties.length === 0 ? (
          <p className="text-sm text-slate-600">登録済みの物件はありません。下のフォームから登録してください。</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {properties.map((property) => (
              <article key={property.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                <h3 className="font-semibold text-ink">{property.property_name}</h3>
                {profile.role === "admin" && (
                  <p className="text-xs text-slate-500">オーナー: {ownerEmails.get(property.user_id) ?? "不明"}</p>
                )}
                <p className="text-sm text-slate-600">
                  Beds24物件ID: {property.beds24_property_id} / Beds24・LINE認証情報:{" "}
                  {configuredIds.has(property.id) ? "登録済み" : "未設定"} / 返信:{" "}
                  {property.reply_mode === "auto" ? "AI自動返信" : "承認後に返信"}
                </p>
                <p className="text-sm text-slate-600">LINE連携済みゲスト: {linkedCounts.get(property.id) ?? 0}名</p>
                <div className="space-y-1 text-xs text-slate-600">
                  <p>LINE Webhook URL: <code className="break-all">{appUrl}/api/webhooks/line/{property.id}</code></p>
                  <p>ゲスト用予約リンク: <code className="break-all">{appUrl}/l/{property.id}/[BOOKID]</code></p>
                </div>
                <div className="flex flex-wrap gap-3 pt-1">
                  <a href={`/dashboard/settings/ai?propertyId=${property.id}`} className="text-sm font-medium text-sky-700 hover:text-sky-800">
                    AIマニュアルを編集
                  </a>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  予約リンクをBeds24の確認メールに設定すると、ゲストがLINEを開いて予約番号を送信し、予約とLINEが自動で紐づきます。
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <h2 className="mb-2 text-lg font-semibold text-ink">物件を登録・連携</h2>
        <p className="mb-5 text-sm text-slate-600">
          連携情報をサーバーで検証してから保存します。
          {profile.role === "admin" ? " 登録先のオーナーを選択できます。" : ""}
        </p>
        <PropertySetupForm
          billingExempt={billingExempt}
          isAdmin={profile.role === "admin"}
          currentUserId={authData.user.id}
          propertyCount={propertyCount}
          ownerOptions={ownerOptions}
        />
      </section>

      {!billingExempt && billablePropertyCount > 0 && (
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <h2 className="text-lg font-semibold text-ink">ご利用料金</h2>
          <p className="mt-2 text-sm text-slate-600">
            {billablePropertyCount === 1
              ? `1アカウント基本料金：月額 ${BASE_PRICE_JPY.toLocaleString("ja-JP")}円（税込）`
              : monthlyPrice === null
                ? `${billablePropertyCount}物件：現在の料金プラン上限を超えています`
                : `基本料金 ${BASE_PRICE_JPY.toLocaleString("ja-JP")}円 + 2〜5物件追加料金 ${MULTI_PROPERTY_ADDON_JPY.toLocaleString("ja-JP")}円 = 月額 ${monthlyPrice.toLocaleString("ja-JP")}円（税込）`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            2〜{MAX_PROPERTIES_PER_ACCOUNT}物件の追加料金は、物件数にかかわらず一律です。1アカウント最大
            {MAX_PROPERTIES_PER_ACCOUNT}物件（2〜5物件の合計は月額{MULTI_PROPERTY_PRICE_JPY.toLocaleString("ja-JP")}円）。
          </p>
          {subscriptionActive ? (
            <p className="mt-3 text-sm font-medium text-emerald-700">Stripeの利用契約は有効です。</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-slate-600">利用を開始するにはStripeで定期決済を登録してください。</p>
              <SubscriptionCheckoutButton />
            </>
          )}
        </section>
      )}
    </div>
  );
}
