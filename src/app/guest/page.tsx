import { notFound } from "next/navigation";
import { GuestRegistryForm } from "@/components/GuestRegistryForm";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GuestRegistryPage({
  searchParams,
}: {
  searchParams?: Promise<{ bookingId?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const bookingId = (params as { bookingId?: string }).bookingId ?? "";
  if (!UUID_RE.test(bookingId)) notFound();

  const admin = createAdminClient();
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, check_in, check_out, num_guests, is_guest_info_completed, lock_code_sent, property_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    console.error("Guest registry page: failed to load booking", error);
    throw new Error("Unable to load guest registry booking");
  }
  if (!booking || booking.lock_code_sent) notFound();

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("name")
    .eq("id", booking.property_id)
    .single();
  if (propertyError) {
    console.error("Guest registry page: failed to load property", propertyError);
    throw new Error("Unable to load property");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <p className="text-sm font-semibold text-brand-700">宿泊者情報のご登録</p>
          <h1 className="mt-2 text-2xl font-bold text-ink">{property.name}</h1>
          <p className="mt-3 text-sm text-slate-600">
            {booking.check_in} ～ {booking.check_out} ・ {booking.num_guests}名
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            ご予約の全員分をご入力ください。日本国籍以外の方はパスポート番号と画像が必要です。
          </p>
        </header>
        <GuestRegistryForm
          bookingId={booking.id}
          numGuests={booking.num_guests}
          isCompleted={booking.is_guest_info_completed}
        />
      </div>
    </main>
  );
}
