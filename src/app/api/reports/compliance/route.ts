import { NextResponse, type NextRequest } from "next/server";
import { authorizeProperty } from "@/lib/authorize-property";
import { createAdminClient } from "@/lib/supabase/admin";

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get("propertyId") ?? "";
  const year = Number(request.nextUrl.searchParams.get("year"));
  const period = Number(request.nextUrl.searchParams.get("period"));
  if (!/^[0-9a-f-]{36}$/i.test(propertyId) || !Number.isInteger(year) || !Number.isInteger(period) || period < 1 || period > 6) {
    return NextResponse.json({ error: "propertyId, year and period (1-6) are required" }, { status: 400 });
  }
  const authorization = await authorizeProperty(propertyId);
  if (!authorization.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!authorization.property) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const startMonth = (period - 1) * 2;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 2, 1));
  const startDate = dateOnly(start);
  const endDate = dateOnly(end);
  const admin = createAdminClient();
  const [propertyResult, bookingsResult] = await Promise.all([
    admin.from("properties").select("name").eq("id", propertyId).single(),
    admin
      .from("bookings")
      .select("id, beds24_booking_id, check_in, check_out, num_guests")
      .eq("property_id", propertyId)
      .lt("check_in", endDate)
      .gt("check_out", startDate)
      .not("status", "in", '("cancelled","canceled","black","deleted")'),
  ]);
  if (propertyResult.error || bookingsResult.error) {
    console.error("Compliance report query failed", propertyResult.error ?? bookingsResult.error);
    return NextResponse.json({ error: "Unable to create compliance report" }, { status: 500 });
  }
  const bookingIds = bookingsResult.data.map((booking) => booking.id);
  const membersResult = bookingIds.length
    ? await admin
        .from("guest_members")
        .select("booking_id, nationality, is_guest_info_completed")
        .in("booking_id", bookingIds)
    : { data: [], error: null };
  if (membersResult.error) {
    console.error("Compliance report guest query failed", membersResult.error);
    return NextResponse.json({ error: "Unable to load report guest data" }, { status: 500 });
  }

  const membersByBooking = new Map<string, string[]>();
  for (const member of membersResult.data ?? []) {
    const nationalities = membersByBooking.get(member.booking_id) ?? [];
    nationalities.push(member.is_guest_info_completed ? member.nationality : "未提出");
    membersByBooking.set(member.booking_id, nationalities);
  }

  const nationalityBreakdown: Record<string, { guests: number; guestNights: number }> = {};
  const operatingDates = new Set<string>();
  let guestNights = 0;
  for (const booking of bookingsResult.data) {
    const nationalities = membersByBooking.get(booking.id) ?? Array.from(
      { length: booking.num_guests },
      () => "未提出",
    );
    const firstNight = new Date(`${booking.check_in}T00:00:00.000Z`);
    const lastNight = new Date(`${booking.check_out}T00:00:00.000Z`);
    for (let night = firstNight; night < lastNight; night = new Date(night.getTime() + 86_400_000)) {
      const day = dateOnly(night);
      if (day < startDate || day >= endDate) continue;
      operatingDates.add(day);
      for (const nationality of nationalities) {
        const totals = nationalityBreakdown[nationality] ?? { guests: 0, guestNights: 0 };
        totals.guestNights += 1;
        nationalityBreakdown[nationality] = totals;
        guestNights += 1;
      }
    }
    for (const nationality of new Set(nationalities)) {
      nationalityBreakdown[nationality].guests += nationalities.filter((item) => item === nationality).length;
    }
  }

  return NextResponse.json({
    property: propertyResult.data.name,
    year,
    period: `${startMonth + 1}-${startMonth + 2}`,
    startDate,
    endDateExclusive: endDate,
    bookingCount: bookingsResult.data.length,
    guestNights,
    operatingDays: operatingDates.size,
    nationalityBreakdown,
  });
}
