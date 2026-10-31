"use server";

import { revalidatePath } from "next/cache";
import { configureLineWebhook, registerProperty } from "@/lib/property-registration";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { syncTenantStripeQuantity } from "@/lib/stripe-billing";
import type { ReplyMode } from "@/types/database";

export type RegisterPropertyState = {
  error?: string;
  success?: {
    propertyId: string;
    propertyName: string;
    lineBotName: string;
    beds24PropertyName: string;
    webhookUrl: string;
    bookingLinkTemplate: string;
    webhookStatus: "ok" | "skipped" | "failed";
  };
} | null;

export type AiManualState = {
  error?: string;
  success?: string;
} | null;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function registerPropertyAction(
  _previousState: RegisterPropertyState,
  formData: FormData,
): Promise<RegisterPropertyState> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { error: "ログインしてください。" };

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, is_internal_free")
    .eq("id", authData.user.id)
    .single();
  if (profileError) {
    console.error("Property setup: failed to load profile", profileError);
    return { error: "アカウント情報を確認できませんでした。時間をおいて再度お試しください。" };
  }
  if (profile.role !== "admin" && profile.role !== "owner") {
    return { error: "このアカウントには物件を設定する権限がありません。" };
  }

  const propertyName = field(formData, "propertyName");
  const ownerId = profile.role === "admin" ? field(formData, "ownerId") || authData.user.id : authData.user.id;
  const beds24PropertyId = field(formData, "beds24PropertyId");
  const beds24CredentialType = field(formData, "beds24CredentialType");
  const beds24InviteCode = field(formData, "beds24InviteCode");
  const beds24RefreshToken = field(formData, "beds24RefreshToken");
  const lineChannelAccessToken = field(formData, "lineChannelAccessToken");
  const lineChannelSecret = field(formData, "lineChannelSecret");
  const houseRulesText = field(formData, "houseRulesText");
  const replyMode = field(formData, "replyMode");
  const parsedReplyMode: ReplyMode | null =
    replyMode === "auto" || replyMode === "approval" ? replyMode : null;
  const [ownerProfileResult, tenantResult] = await Promise.all([
    admin.from("profiles").select("id, is_internal_free").eq("id", ownerId).single(),
    admin.from("tenants").select("is_free_tier").eq("id", ownerId).single(),
  ]);
  if (ownerProfileResult.error || tenantResult.error) {
    console.error("Property setup: failed to load target account", ownerProfileResult.error ?? tenantResult.error);
    return { error: "登録先アカウントを確認できませんでした。選択内容を確認してください。" };
  }
  const isBillingExempt = ownerProfileResult.data.is_internal_free || tenantResult.data.is_free_tier;

  if (
    !propertyName ||
    propertyName.length > 120 ||
    !/^\d+$/.test(beds24PropertyId) ||
    !lineChannelAccessToken ||
    !lineChannelSecret ||
    !["inviteCode", "refreshToken"].includes(beds24CredentialType) ||
    (beds24CredentialType === "inviteCode" && !beds24InviteCode) ||
    (beds24CredentialType === "refreshToken" && !beds24RefreshToken) ||
    !parsedReplyMode ||
    (!isBillingExempt && field(formData, "billingConsent") !== "yes")
  ) {
    return {
      error: isBillingExempt
        ? "必須項目を確認してください。物件名、Beds24物件ID、連携情報、返信モードを入力してください。"
        : "必須項目を入力し、月額料金の確認にチェックしてください。",
    };
  }
  if (houseRulesText.length > 20_000) {
    return { error: "ハウスルールは20,000文字以内で入力してください。" };
  }
  if (
    beds24InviteCode.length > 2_000 ||
    beds24RefreshToken.length > 2_000 ||
    lineChannelAccessToken.length > 8_000 ||
    lineChannelSecret.length > 2_000
  ) {
    return { error: "連携情報の形式を確認してください。" };
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    return { error: "アプリの公開URLが未設定です。管理者へお問い合わせください。" };
  }
  const { data: existingProperty, error: existingPropertyError } = await admin
    .from("properties")
    .select("id")
    .eq("user_id", ownerId)
    .eq("beds24_property_id", beds24PropertyId)
    .maybeSingle();
  if (existingPropertyError) {
    console.error("Property setup: failed to check for duplicate property", existingPropertyError);
    return { error: "登録済み物件を確認できませんでした。時間をおいて再度お試しください。" };
  }
  if (existingProperty) return { error: "このBeds24物件IDはすでに登録されています。" };

  try {
    const registered = await registerProperty({
      ownerId,
      propertyName,
      beds24PropertyId,
      beds24:
        beds24CredentialType === "inviteCode"
          ? { inviteCode: beds24InviteCode }
          : { refreshToken: beds24RefreshToken },
      lineChannelAccessToken,
      lineChannelSecret,
      houseRulesText: houseRulesText || null,
      replyMode: parsedReplyMode,
    });

    let webhookStatus: "ok" | "skipped" | "failed" = "failed";
    try {
      const webhook = await configureLineWebhook(registered.propertyId, lineChannelAccessToken);
      webhookStatus = webhook.status;
      if (webhook.status === "failed") {
        console.error("Property setup: LINE webhook configuration failed", registered.propertyId, webhook.reason);
      }
    } catch (error) {
      console.error("Property setup: LINE webhook configuration failed", registered.propertyId, error);
    }

    try {
      await syncTenantStripeQuantity(ownerId);
    } catch (error) {
      console.error("Property setup: Stripe quantity synchronization failed", registered.propertyId, error);
      return {
        error: "物件と連携情報は登録されましたが、課金対象数の同期に失敗しました。サポートへお問い合わせください。",
      };
    }

    return {
      success: {
        propertyId: registered.propertyId,
        propertyName,
        lineBotName: registered.lineBotName,
        beds24PropertyName: registered.beds24PropertyName,
        webhookUrl: registered.webhookUrl,
        bookingLinkTemplate: registered.bookingLinkTemplate,
        webhookStatus,
      },
    };
  } catch (error) {
    console.error("Property setup: registration failed", error);
    return {
      error:
        "連携情報を確認できませんでした。LINEのアクセストークンとチャネルシークレット、Beds24の招待コードまたはrefresh token、Beds24物件IDとAPI権限をご確認ください。",
    };
  }
}

export async function savePropertyAiManualAction(
  _previousState: AiManualState,
  formData: FormData,
): Promise<AiManualState> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { error: "ログインしてください。" };

  const propertyId = field(formData, "propertyId");
  const houseRulesText = field(formData, "houseRulesText");

  if (!propertyId) return { error: "物件が選択されていません。" };
  if (houseRulesText.length > 20_000) return { error: "AIマニュアルは20,000文字以内で入力してください。" };

  const admin = createAdminClient();
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("id, user_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError) {
    console.error("AI manual: failed to load property", propertyError);
    return { error: "物件情報を確認できませんでした。" };
  }
  if (!property) return { error: "対象の物件が見つかりません。" };

  const profileResult = await admin.from("profiles").select("role").eq("id", authData.user.id).single();
  if (profileResult.error) {
    console.error("AI manual: failed to load profile", profileResult.error);
    return { error: "アカウント情報を確認できませんでした。" };
  }

  if (profileResult.data.role !== "admin" && property.user_id !== authData.user.id) {
    return { error: "この物件のAIマニュアルを編集する権限がありません。" };
  }

  const { error: updateError } = await admin
    .from("properties")
    .update({ house_rules_text: houseRulesText || null })
    .eq("id", property.id);

  if (updateError) {
    console.error("AI manual: failed to update property", updateError);
    return { error: "AIマニュアルを保存できませんでした。" };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/ai");

  return { success: "AIマニュアルを保存しました。" };
}
