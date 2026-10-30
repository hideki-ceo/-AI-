import Link from "next/link";
import { redirect } from "next/navigation";
import {
  bookingStatus,
  PAYMENT_SOURCE_LABELS,
  type BookingStatus,
  type LockState,
} from "@/lib/booking-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "予約一覧", robots: { index: false, follow: false } };

const MAX_BOOKINGS = 200;

const STATE_BADGES: Record<LockState, { label: string; className: string }> = {
  sent: { label: "鍵番号 送信済み", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  processing: { label: "送信中", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  scheduled: { label: "送信予定", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  ready: { label: "次回の自動送信で送信", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  blocked: { label: "送信保留", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  failed: { label: "送信失敗", className: "bg-red-50 text-red-700 ring-red-200" },
  cancelled: { label: "キャンセル", className: "bg-slate-100 text-slate-500 ring-slate-200" },
};

type SearchParams = Promise<{ property?: string; view?: string }>;

function todayInJapan(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function formatDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/dashboard/bookings");

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (profileError) throw new Error(`Unable to load profile: ${profileError.message}`);

  // admin（ソアリング合同会社）は全物件、オーナーは自分の物件のみ
  let propertyQuery = admin
    .from("properties")
    .select("id, name, tenant_id, is_exempt_from_billing")
    .order("name");
  if (profile.role !== "admin") propertyQuery = propertyQuery.eq("user_id", data.user.id);
  const { data: properties, error: propertiesError } = await propertyQuery;
  if (propertiesError) throw new Error(`Unable to load properties: ${propertiesError.message}`);

  const params = await searchParams;
  const view = params.view === "past" ? "past" : "upcoming";
  const selected = properties.find((property) => property.id === params.property);
  const targetProperties = selected ? [selected] : properties;
  const today = todayInJapan();

  const rows: { booking: BookingRow; status: BookingStatus; propertyName: string }[] = [];
  if (targetProperties.length) {
    let bookingQuery = admin
      .from("bookings")
      .select(
        "id, property_id, tenant_id, beds24_booking_id, source, guest_name, guest_email, check_in, check_out, num_guests, " +
          "is_paid, payment_source, is_guest_info_completed, lock_code_sent, lock_code_delivery_status, lock_code_delivery_error, status",
      )
      .in("property_id", targetProperties.map((property) => property.id))
      .limit(MAX_BOOKINGS);
    bookingQuery =
      view === "past"
        ? bookingQuery.lt("check_out", today).order("check_in", { ascending: false })
        : bookingQuery.gte("check_out", today).order("check_in", { ascending: true });
    const { data: bookingData, error: bookingsError } = await bookingQuery;
    if (bookingsError) throw new Error(`Unable to load bookings: ${bookingsError.message}`);
    const bookings = bookingData as unknown as BookingRow[];

    const bookingIds = bookings.map((booking) => booking.id);
    const tenantIds = [...new Set(targetProperties.map((property) => property.tenant_id))];
    const [membersResult, lineResult, tenantsResult, profilesResult] = await Promise.all([
      bookingIds.length
        ? admin.from("guest_members").select("booking_id, is_guest_info_completed").in("booking_id", bookingIds)
        : Promise.resolve({ data: [], error: null }),
      bookings.length
        ? admin
            .from("line_guests")
            .select("property_id, beds24_booking_id")
            .in("property_id", targetProperties.map((property) => property.id))
            .in("beds24_booking_id", bookings.map((booking) => booking.beds24_booking_id))
        : Promise.resolve({ data: [], error: null }),
      admin.from("tenants").select("id, is_free_tier, stripe_subscription_status").in("id", tenantIds),
      admin.from("profiles").select("id, is_internal_free").in("id", tenantIds),
    ]);
    for (const result of [membersResult, lineResult, tenantsResult, profilesResult]) {
      if (result.error) throw new Error(`Unable to load booking status: ${result.error.message}`);
    }

    const members = new Map<string, { submitted: number; allCompleted: boolean }>();
    for (const member of membersResult.data ?? []) {
      const entry = members.get(member.booking_id) ?? { submitted: 0, allCompleted: true };
      entry.submitted += 1;
      entry.allCompleted &&= member.is_guest_info_completed;
      members.set(member.booking_id, entry);
    }
    const linked = new Set((lineResult.data ?? []).map((row) => `${row.property_id}:${row.beds24_booking_id}`));
    const tenants = new Map((tenantsResult.data ?? []).map((tenant) => [tenant.id, tenant]));
    const internalFree = new Set(
      (profilesResult.data ?? []).filter((row) => row.is_internal_free).map((row) => row.id),
    );
    const propertyById = new Map(targetProperties.map((property) => [property.id, property]));

    for (const booking of bookings) {
      const property = propertyById.get(booking.property_id);
      const tenant = tenants.get(booking.tenant_id);
      const member = members.get(booking.id);
      const serviceActive = Boolean(
        tenant?.is_free_tier ||
          internalFree.has(booking.tenant_id) ||
          property?.is_exempt_from_billing ||
          tenant?.stripe_subscription_status === "active",
      );
      rows.push({
        booking,
        propertyName: property?.name ?? "",
        status: bookingStatus(
          {
            ...booking,
            submittedGuests: member?.submitted ?? 0,
            allGuestsCompleted: member?.allCompleted ?? false,
            lineLinked: linked.has(`${booking.property_id}:${booking.beds24_booking_id}`),
            serviceActive,
          },
          today,
        ),
      });
    }
  }

  const attention = rows.filter((row) => row.status.needsAttention).length;
  const sent = rows.filter((row) => row.status.state === "sent").length;
  const pending = rows.filter((row) => ["scheduled", "ready", "processing", "blocked"].includes(row.status.state)).length;
  const linkFor = (next: { property?: string; view?: string }) => {
    const query = new URLSearchParams();
    const property = "property" in next ? next.property : selected?.id;
    if (property) query.set("property", property);
    if ((next.view ?? view) === "past") query.set("view", "past");
    const text = query.toString();
    return `/dashboard/bookings${text ? `?${text}` : ""}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">予約一覧</h1>
      <p className="mt-2 text-sm text-slate-600">
        予約ごとに、宿泊名簿・決済・鍵番号の送信状況を確認できます。鍵番号はすべての条件が揃い、チェックインの1週間前になると自動で送信されます。
      </p>

      {properties.length === 0 ? (
        <p className="mt-8 rounded-lg bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-200">登録済みの物件がありません。</p>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav className="flex gap-1 rounded-lg bg-slate-200/60 p-1 text-sm" aria-label="表示期間">
              {[
                { value: "upcoming", label: "これからの予約" },
                { value: "past", label: "過去の予約" },
              ].map((item) => (
                <Link
                  key={item.value}
                  href={linkFor({ view: item.value })}
                  aria-current={view === item.value ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 font-medium ${
                    view === item.value ? "bg-white text-ink shadow-sm" : "text-slate-600 hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {properties.length > 1 && (
              <form className="flex items-center gap-2 text-sm" action="/dashboard/bookings">
                {view === "past" && <input type="hidden" name="view" value="past" />}
                <label htmlFor="property" className="text-slate-600">物件</label>
                <select
                  id="property"
                  name="property"
                  defaultValue={selected?.id ?? ""}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">すべての物件</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>{property.name}</option>
                  ))}
                </select>
                <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-ink">表示</button>
              </form>
            )}
          </div>

          {view === "upcoming" && (
            <dl className="mt-6 grid grid-cols-3 gap-3">
              {[
                { label: "対応が必要", value: attention, className: attention ? "text-red-700" : "text-ink" },
                { label: "送信待ち", value: pending, className: "text-ink" },
                { label: "送信済み", value: sent, className: "text-ink" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <dt className="text-xs text-slate-500">{item.label}</dt>
                  <dd className={`mt-1 text-2xl font-bold tabular-nums ${item.className}`}>
                    {item.value}
                    <span className="ml-1 text-sm font-normal text-slate-500">件</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {rows.length === 0 ? (
            <p className="mt-6 rounded-lg bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-200">
              {view === "past" ? "過去の予約はありません。" : "これからの予約はありません。"}
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {rows.map(({ booking, status, propertyName }) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  status={status}
                  propertyName={targetProperties.length > 1 ? propertyName : null}
                  today={today}
                />
              ))}
            </ul>
          )}
          {rows.length === MAX_BOOKINGS && (
            <p className="mt-4 text-sm text-slate-500">表示は最新の {MAX_BOOKINGS} 件までです。物件を絞り込んでください。</p>
          )}
        </>
      )}
    </div>
  );
}

type BookingRow = {
  id: string;
  property_id: string;
  tenant_id: string;
  beds24_booking_id: string;
  source: string | null;
  guest_name: string;
  guest_email: string | null;
  check_in: string;
  check_out: string;
  num_guests: number;
  is_paid: boolean;
  payment_source: keyof typeof PAYMENT_SOURCE_LABELS | null;
  is_guest_info_completed: boolean;
  lock_code_sent: boolean;
  lock_code_delivery_status: "pending" | "processing" | "sent" | "failed";
  lock_code_delivery_error: string | null;
  status: string;
};

function BookingCard({
  booking,
  status,
  propertyName,
  today,
}: {
  booking: BookingRow;
  status: BookingStatus;
  propertyName: string | null;
  today: string;
}) {
  const badge = STATE_BADGES[status.state];
  const detail =
    status.state === "scheduled"
      ? `${formatDate(status.sendFrom)} の朝9時に自動で送信します`
      : status.state === "ready"
        ? "条件が揃いました。次回の自動送信（毎朝9時）で送信します"
        : status.state === "blocked" && !status.needsAttention
          ? `${formatDate(status.sendFrom)} までに揃えば、その日の朝9時に送信します`
          : null;
  const nights = Math.round(
    (Date.parse(`${booking.check_out}T00:00:00Z`) - Date.parse(`${booking.check_in}T00:00:00Z`)) / 86_400_000,
  );

  return (
    <li
      className={`rounded-xl bg-white p-4 shadow-sm ring-1 sm:p-5 ${
        status.needsAttention ? "ring-red-200" : "ring-slate-200"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-bold text-ink">
            {booking.guest_name || "（ゲスト名なし）"} 様
            <span className="ml-2 text-sm font-normal text-slate-500">{booking.num_guests}名</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            <span className="tabular-nums">
              {formatDate(booking.check_in)} 〜 {formatDate(booking.check_out)}
            </span>
            （{nights}泊）
            {booking.check_in === today && <span className="ml-2 font-semibold text-brand-700">本日チェックイン</span>}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {propertyName && <>{propertyName} ・ </>}
            {booking.source ?? "経路不明"} ・ Beds24 #{booking.beds24_booking_id}
          </p>
        </div>
        <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ring-1 ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {status.state !== "cancelled" && (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Check label="宿泊名簿" ok={booking.is_guest_info_completed} okText="提出済み" ngText="未提出" />
          <Check
            label="決済"
            ok={booking.is_paid}
            okText={booking.payment_source ? `確認済み（${PAYMENT_SOURCE_LABELS[booking.payment_source]}）` : "確認済み"}
            ngText="未確認"
          />
          <Check
            label="鍵番号"
            ok={booking.lock_code_sent}
            okText="送信済み"
            ngText={`${formatDate(status.sendFrom)} から送信可`}
          />
        </dl>
      )}

      {(status.reasons.length > 0 || detail) && status.state !== "sent" && (
        <div
          className={`mt-3 rounded-lg p-3 text-sm ${
            status.needsAttention ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-700"
          }`}
        >
          {detail && <p>{detail}</p>}
          {status.reasons.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5">
              {status.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Check({ label, ok, okText, ngText }: { label: string; ok: boolean; okText: string; ngText: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`font-medium ${ok ? "text-emerald-700" : "text-slate-700"}`}>
        {ok ? "✓ " : ""}
        {ok ? okText : ngText}
      </dd>
    </div>
  );
}
