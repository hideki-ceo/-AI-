import { after, NextResponse, type NextRequest } from "next/server";
import { canUseService } from "@/lib/billing";
import {
  generateConciergeReply,
  generatePreBookingReply,
  type ConversationTurn,
} from "@/lib/gemini";
import { getActiveGuestBooking, linkGuestBooking, parseBookingLinkRequest } from "@/lib/guest-booking";
import {
  askForCheckInDateReply,
  bookingLinkLockedReply,
  bookingLinkedReply,
  bookingNotFoundReply,
  preBookingWelcomeReply,
  type FixedReply,
} from "@/lib/guest-messages";
import {
  isGuestFollowEvent,
  isGuestTextEvent,
  pushText,
  replyText,
  verifyLineSignature,
  type GuestFollowEvent,
  type GuestTextEvent,
  type LineWebhookBody,
} from "@/lib/line";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Tables } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY_LIMIT = 10;
const PREBOOKING_REFERENCE_LIMIT = 60_000;

type ChatMessageUpdate = Database["public"]["Tables"]["chat_messages"]["Update"];

export async function POST(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get("propertyId") ?? "";
  if (!UUID_RE.test(propertyId)) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = createAdminClient();
  const [propertyResult, secretsResult] = await Promise.all([
    supabase.from("properties").select("*").eq("id", propertyId).maybeSingle(),
    supabase
      .from("property_secrets")
      .select("line_channel_secret, line_channel_access_token")
      .eq("property_id", propertyId)
      .maybeSingle(),
  ]);
  if (propertyResult.error || secretsResult.error) {
    console.error("LINE webhook: failed to load property", propertyResult.error ?? secretsResult.error);
    return new NextResponse(null, { status: 500 });
  }
  const property = propertyResult.data;
  const secrets = secretsResult.data;
  if (!property || !secrets) {
    return new NextResponse(null, { status: 404 });
  }

  const rawBody = await request.text();
  if (!verifyLineSignature(rawBody, request.headers.get("x-line-signature"), secrets.line_channel_secret)) {
    return new NextResponse(null, { status: 401 });
  }

  const [ownerResult, tenantResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_internal_free, subscription_status")
      .eq("id", property.user_id)
      .single(),
    supabase.from("tenants").select("is_free_tier").eq("id", property.tenant_id).single(),
  ]);
  if (ownerResult.error || tenantResult.error) {
    console.error("LINE webhook: failed to load billing status", ownerResult.error ?? tenantResult.error);
    return new NextResponse(null, { status: 500 });
  }
  if (!canUseService({
    ...ownerResult.data,
    is_free_tier: tenantResult.data.is_free_tier,
    is_exempt_from_billing: property.is_exempt_from_billing,
  })) {
    return new NextResponse(null, { status: 200 });
  }

  const { events } = JSON.parse(rawBody) as LineWebhookBody;

  after(async () => {
    for (const event of events) {
      if (isGuestTextEvent(event)) {
        await handleGuestMessage(property, secrets.line_channel_access_token, event);
      } else if (isGuestFollowEvent(event)) {
        await handleFollow(property, secrets.line_channel_access_token, event);
      }
    }
  });

  return new NextResponse(null, { status: 200 });
}

async function handleGuestMessage(
  property: Tables<"properties">,
  accessToken: string,
  event: GuestTextEvent,
) {
  const supabase = createAdminClient();
  const lineUserId = event.source.userId;

  const { data: message, error: insertError } = await supabase
    .from("chat_messages")
    .insert({
      property_id: property.id,
      line_user_id: lineUserId,
      line_webhook_event_id: event.webhookEventId,
      incoming_message: event.message.text,
    })
    .select("id, created_at")
    .single();
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("LINE webhook: failed to save message", insertError);
    }
    return;
  }

  const update = async (values: ChatMessageUpdate) => {
    const { error } = await supabase.from("chat_messages").update(values).eq("id", message.id);
    if (error) console.error("LINE webhook: failed to update message", message.id, error);
  };

  const sendFixedReply = async (reply: FixedReply, values: ChatMessageUpdate = {}) => {
    await sendToGuest(accessToken, event.replyToken, lineUserId, reply.text, message.id);
    await update({
      ...values,
      ai_reply_draft: reply.text,
      ai_reply_japanese: reply.japanese,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  };

  try {
    const linkRequest = parseBookingLinkRequest(event.message.text);
    if (linkRequest) {
      if (!linkRequest.fromEmailLink && linkRequest.checkInCandidates.length === 0) {
        await sendFixedReply(askForCheckInDateReply(linkRequest.bookingId));
        return;
      }
      const result = await linkGuestBooking(property, lineUserId, linkRequest);
      if (result.status === "linked") {
        await sendFixedReply(bookingLinkedReply(result.booking), {
          beds24_booking_id: linkRequest.bookingId,
        });
      } else {
        await sendFixedReply(
          result.status === "locked" ? bookingLinkLockedReply() : bookingNotFoundReply(),
        );
      }
      return;
    }

    const booking = await getActiveGuestBooking(property, lineUserId);
    if (!booking) {
      const history = await loadHistory(property.id, lineUserId, message.created_at);
      const { data: documents, error: documentsError } = await supabase
        .from("property_ai_documents")
        .select("file_name, extracted_text")
        .eq("property_id", property.id)
        .order("created_at", { ascending: true })
        .limit(10);
      if (documentsError) throw new Error(`failed to load pre-booking AI documents: ${documentsError.message}`);

      let remainingCharacters = PREBOOKING_REFERENCE_LIMIT;
      const referenceDocuments = (documents ?? [])
        .map((document) => {
          const text = document.extracted_text.slice(0, remainingCharacters);
          remainingCharacters -= text.length;
          return { fileName: document.file_name, text };
        })
        .filter((document) => document.text.length > 0);
      const ai = await generatePreBookingReply({
        propertyName: property.property_name,
        prebookingRules: property.prebooking_rules_text,
        referenceDocuments,
        history,
        message: event.message.text,
      });

      const draft: ChatMessageUpdate = {
        guest_language: ai.language,
        ai_reply_draft: ai.reply,
        ai_reply_japanese: ai.replyJapanese,
      };
      if (property.reply_mode !== "auto" || ai.needsHuman) {
        await update({ ...draft, status: "pending" });
        return;
      }

      await sendToGuest(accessToken, event.replyToken, lineUserId, ai.reply, message.id);
      await update({ ...draft, status: "sent", sent_at: new Date().toISOString() });
      return;
    }

    const history = await loadHistory(property.id, lineUserId, message.created_at);
    const ai = await generateConciergeReply({
      propertyName: property.property_name,
      houseRules: property.house_rules_text,
      booking,
      history,
      message: event.message.text,
    });

    const draft: ChatMessageUpdate = {
      beds24_booking_id: String(booking.id),
      guest_language: ai.language,
      ai_reply_draft: ai.reply,
      ai_reply_japanese: ai.replyJapanese,
    };

    if (property.reply_mode !== "auto" || ai.needsHuman) {
      await update({ ...draft, status: "pending" });
      return;
    }

    await sendToGuest(accessToken, event.replyToken, lineUserId, ai.reply, message.id);
    await update({ ...draft, status: "sent", sent_at: new Date().toISOString() });
  } catch (err) {
    console.error("LINE webhook: failed to handle message", message.id, err);
    await update({
      status: "failed",
      error_message: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
    });
  }
}

async function handleFollow(
  property: Tables<"properties">,
  accessToken: string,
  event: GuestFollowEvent,
) {
  if (event.deliveryContext?.isRedelivery) return;
  try {
    const booking = await getActiveGuestBooking(property, event.source.userId);
    if (!booking) {
      await replyText(accessToken, event.replyToken, preBookingWelcomeReply().text);
    }
  } catch (err) {
    console.error("LINE webhook: failed to handle follow", property.id, err);
  }
}

async function loadHistory(
  propertyId: string,
  lineUserId: string,
  before: string,
): Promise<ConversationTurn[]> {
  const { data, error } = await createAdminClient()
    .from("chat_messages")
    .select("incoming_message, ai_reply_draft, status")
    .eq("property_id", propertyId)
    .eq("line_user_id", lineUserId)
    .lt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(`failed to load history: ${error.message}`);

  return data.reverse().map((row) => ({
    guest: row.incoming_message,
    reply: row.status === "sent" ? row.ai_reply_draft : null,
  }));
}

async function sendToGuest(
  accessToken: string,
  replyToken: string,
  lineUserId: string,
  text: string,
  messageId: string,
) {
  try {
    await replyText(accessToken, replyToken, text);
  } catch (err) {
    console.warn("LINE reply failed, falling back to push", { messageId, err });
    try {
      await pushText(accessToken, lineUserId, text);
    } catch (pushError) {
      console.error("LINE push fallback failed", messageId, pushError);
    }
  }
}
