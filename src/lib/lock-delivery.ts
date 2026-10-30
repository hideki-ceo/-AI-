import "server-only";
import { getBeds24LockCode } from "@/lib/beds24";
import { sendTransactionalEmail } from "@/lib/email";
import { pushText } from "@/lib/line";
import { createAdminClient } from "@/lib/supabase/admin";

// 鍵番号はチェックインのこの日数前より早くは送らない（claim_lock_delivery と同じ値にすること）
export const LOCK_CODE_LEAD_DAYS = 7;

type Booking = {
  id: string;
  property_id: string;
  beds24_booking_id: string;
  guest_email: string | null;
  check_in: string;
  check_out: string;
  guest_name: string;
  status: string;
};

export async function deliverLockCode(bookingId: string): Promise<"sent" | "withheld"> {
  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin.rpc("claim_lock_delivery", {
    p_booking_id: bookingId,
  });
  if (claimError) throw new Error(`Unable to verify lock delivery conditions: ${claimError.message}`);
  if (!claimed) return "withheld";

  try {
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, property_id, beds24_booking_id, guest_email, check_in, check_out, guest_name, status")
      .eq("id", bookingId)
      .single();
    if (bookingError) throw new Error(`Unable to load lock delivery booking: ${bookingError.message}`);
    const deliveryBooking = booking as Booking;
    if (!deliveryBooking.guest_email) throw new Error("A guest email address is required before lock delivery");

    const [propertyResult, secretsResult, lineGuestResult] = await Promise.all([
      admin
        .from("properties")
        .select("beds24_property_id")
        .eq("id", deliveryBooking.property_id)
        .single(),
      admin
        .from("property_secrets")
        .select("line_channel_access_token")
        .eq("property_id", deliveryBooking.property_id)
        .single(),
      admin
        .from("line_guests")
        .select("line_user_id")
        .eq("property_id", deliveryBooking.property_id)
        .eq("beds24_booking_id", deliveryBooking.beds24_booking_id)
        .limit(1)
        .maybeSingle(),
    ]);
    if (propertyResult.error || secretsResult.error) {
      throw new Error(`Unable to load lock delivery integration: ${propertyResult.error?.message ?? secretsResult.error?.message}`);
    }
    if (lineGuestResult.error) throw new Error(`Unable to load guest LINE account: ${lineGuestResult.error.message}`);
    if (!lineGuestResult.data) throw new Error("The guest must link their LINE account before lock delivery");

    const lockCode = await getBeds24LockCode(
      deliveryBooking.property_id,
      propertyResult.data.beds24_property_id,
      deliveryBooking.beds24_booking_id,
    );
    await Promise.all([
      sendTransactionalEmail({
        idempotencyKey: `lock-code-${deliveryBooking.id}`,
        to: deliveryBooking.guest_email,
        subject: "チェックインのご案内",
        text:
          `${deliveryBooking.guest_name} 様\n\nご予約ありがとうございます。\n` +
          `チェックイン期間: ${deliveryBooking.check_in} ～ ${deliveryBooking.check_out}\n` +
          `スマートロックの鍵番号: ${lockCode}\n\n鍵番号は第三者に共有しないでください。`,
      }),
      pushText(
        secretsResult.data.line_channel_access_token,
        lineGuestResult.data.line_user_id,
        `チェックインのご案内です。\nご宿泊: ${deliveryBooking.check_in} ～ ${deliveryBooking.check_out}\nスマートロックの鍵番号: ${lockCode}`,
        deliveryBooking.id,
      ),
    ]);
    const { error: finishError } = await admin.rpc("finish_lock_delivery", {
      p_booking_id: bookingId,
      p_error: null,
    });
    if (finishError) throw new Error(`Unable to confirm lock code delivery: ${finishError.message}`);
    return "sent";
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown lock delivery error";
    const { error: finishError } = await admin.rpc("finish_lock_delivery", {
      p_booking_id: bookingId,
      p_error: detail,
    });
    if (finishError) {
      console.error("Unable to record lock code delivery failure", bookingId, finishError);
    }
    throw error;
  }
}
