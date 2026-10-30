import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type GuestRegisterRow = {
  beds24BookingId: string;
  checkIn: string;
  checkOut: string;
  fullName: string;
  address: string;
  gender: string;
  phoneNumber: string;
  nationality: string;
  passportNumber: string | null;
};

export type GuestRegister = {
  property: { name: string; address: string; minpakuRegistrationNo: string | null };
  year: number;
  month: number;
  rows: GuestRegisterRow[];
};

// チェックインが指定月の予約（キャンセル除く）の宿泊者全員
export async function loadGuestRegister(propertyId: string, year: number, month: number): Promise<GuestRegister> {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const admin = createAdminClient();
  const [propertyResult, bookingsResult] = await Promise.all([
    admin.from("properties").select("name, address, minpaku_registration_no").eq("id", propertyId).single(),
    admin
      .from("bookings")
      .select("id, check_in, check_out, beds24_booking_id")
      .eq("property_id", propertyId)
      .gte("check_in", start)
      .lt("check_in", end)
      .not("status", "in", '("cancelled","canceled","black","deleted")')
      .order("check_in"),
  ]);
  if (propertyResult.error || bookingsResult.error) {
    throw new Error(`Guest register query failed: ${(propertyResult.error ?? bookingsResult.error)?.message}`);
  }
  const bookingIds = bookingsResult.data.map((booking) => booking.id);
  const guestsResult = bookingIds.length
    ? await admin
        .from("guest_members")
        .select("booking_id, is_representative, full_name, address, gender, phone_number, nationality, passport_number, created_at")
        .in("booking_id", bookingIds)
        .order("created_at")
    : { data: [], error: null };
  if (guestsResult.error) throw new Error(`Guest register member query failed: ${guestsResult.error.message}`);

  const bookingOrder = new Map(bookingIds.map((id, index) => [id, index]));
  const bookingMap = new Map(bookingsResult.data.map((booking) => [booking.id, booking]));
  // チェックイン順、同じ予約内は代表者を先頭にする
  const guests = [...(guestsResult.data ?? [])].sort(
    (a, b) =>
      (bookingOrder.get(a.booking_id) ?? 0) - (bookingOrder.get(b.booking_id) ?? 0) ||
      Number(b.is_representative) - Number(a.is_representative),
  );
  return {
    property: {
      name: propertyResult.data.name,
      address: propertyResult.data.address,
      minpakuRegistrationNo: propertyResult.data.minpaku_registration_no,
    },
    year,
    month,
    rows: guests.map((guest) => {
      const booking = bookingMap.get(guest.booking_id);
      return {
        beds24BookingId: booking?.beds24_booking_id ?? "",
        checkIn: booking?.check_in ?? "",
        checkOut: booking?.check_out ?? "",
        fullName: guest.full_name,
        address: guest.address,
        gender: guest.gender,
        phoneNumber: guest.phone_number,
        nationality: guest.nationality,
        passportNumber: guest.passport_number,
      };
    }),
  };
}
