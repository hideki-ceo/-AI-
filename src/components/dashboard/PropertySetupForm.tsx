"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  registerPropertyAction,
  type RegisterPropertyState,
} from "@/app/dashboard/settings/actions";
import {
  BASE_PRICE_JPY,
  MAX_PROPERTIES_PER_ACCOUNT,
  MULTI_PROPERTY_ADDON_JPY,
  MULTI_PROPERTY_PRICE_JPY,
} from "@/lib/billing";

const initialState: RegisterPropertyState = null;

type OwnerOption = { id: string; email: string; billingExempt: boolean; propertyCount: number };

export function PropertySetupForm({
  billingExempt,
  isAdmin,
  currentUserId,
  propertyCount,
  ownerOptions = [],
}: {
  billingExempt: boolean;
  isAdmin: boolean;
  currentUserId: string;
  propertyCount: number;
  ownerOptions: OwnerOption[];
}) {
  const [state, action, pending] = useActionState(registerPropertyAction, initialState);
  const [credentialType, setCredentialType] = useState("inviteCode");
  const [selectedOwnerId, setSelectedOwnerId] = useState(currentUserId);
  const formRef = useRef<HTMLFormElement>(null);
  const selectedOwner = ownerOptions.find((owner) => owner.id === selectedOwnerId);
  const selectedAccountExempt = isAdmin ? selectedOwner?.billingExempt ?? false : billingExempt;
  const selectedPropertyCount = isAdmin ? selectedOwner?.propertyCount ?? 0 : propertyCount;
  const propertyLimitReached = selectedPropertyCount >= MAX_PROPERTIES_PER_ACCOUNT;

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setCredentialType("inviteCode");
      setSelectedOwnerId(currentUserId);
    }
  }, [currentUserId, state]);

  return (
    <div className="space-y-5">
      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
      )}
      {state?.success && (
        <div role="status" className="space-y-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">{state.success.propertyName} を登録しました。</p>
          <p>Beds24: {state.success.beds24PropertyName} / LINE公式アカウント: {state.success.lineBotName}</p>
          <p>
            LINE Webhook:{" "}
            {state.success.webhookStatus === "ok"
              ? "設定・接続テスト済み"
              : state.success.webhookStatus === "skipped"
                ? "公開後にLINE Developersへ設定してください"
                : "設定に失敗しました。LINE DevelopersのWebhook設定を確認してください"}
          </p>
          <div>
            <p className="font-medium">LINE Webhook URL</p>
            <code className="mt-1 block break-all rounded bg-white/70 p-2 text-xs">{state.success.webhookUrl}</code>
          </div>
          <div>
            <p className="font-medium">Beds24予約確認メールに設定するゲスト用リンク</p>
            <code className="mt-1 block break-all rounded bg-white/70 p-2 text-xs">{state.success.bookingLinkTemplate}</code>
            <p className="mt-1 text-xs">`[BOOKID]` はBeds24の予約番号に置き換わります。ゲストはリンクからLINEを開き、予約番号を送信して紐づけます。</p>
          </div>
        </div>
      )}
      {propertyLimitReached && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          1アカウントに登録できる物件は最大{MAX_PROPERTIES_PER_ACCOUNT}件です。このアカウントは登録上限に達しています。
        </p>
      )}
      <form ref={formRef} action={action} className="space-y-5">
        {isAdmin && (
          <label className="block text-sm text-slate-700">
            登録先のオーナー
            <select
              name="ownerId"
              value={selectedOwnerId}
              onChange={(event) => setSelectedOwnerId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>{owner.email}</option>
              ))}
            </select>
          </label>
        )}
        <section className="space-y-4">
          <h3 className="font-semibold text-ink">1. 物件とBeds24</h3>
          <label className="block text-sm text-slate-700">
            管理画面に表示する物件名
            <input name="propertyName" required maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm text-slate-700">
            Beds24の物件ID
            <input name="beds24PropertyId" required inputMode="numeric" pattern="[0-9]+" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm text-slate-700">
            Beds24の認証方法
            <select
              name="beds24CredentialType"
              value={credentialType}
              onChange={(event) => setCredentialType(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="inviteCode">招待コード（初回接続）</option>
              <option value="refreshToken">refresh token（すでに交換済み）</option>
            </select>
          </label>
          {credentialType === "inviteCode" ? (
            <label className="block text-sm text-slate-700">
              Beds24招待コード
              <input name="beds24InviteCode" required autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          ) : (
            <label className="block text-sm text-slate-700">
              Beds24 refresh token
              <input name="beds24RefreshToken" required type="password" autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          )}
          <p className="text-xs leading-5 text-amber-800">
            招待コードは一度だけ使えます。Beds24物件IDとAPI権限（予約・物件の読み取り）を事前に確認してください。認証情報はサーバー側で保管し、画面には再表示しません。
          </p>
        </section>

        <section className="space-y-4 border-t border-slate-200 pt-5">
          <h3 className="font-semibold text-ink">2. LINE連携</h3>
          <label className="block text-sm text-slate-700">
            LINEチャネルアクセストークン（長期）
            <input name="lineChannelAccessToken" required type="password" autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm text-slate-700">
            LINEチャネルシークレット
            <input name="lineChannelSecret" required type="password" autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <p className="text-xs leading-5 text-slate-600">
            登録後にWebhook URLを設定します。localhostではLINE側の自動設定ができないため、公開HTTPS環境へ配置した後に表示URLをLINE Developersへ登録してください。
          </p>
        </section>

        <section className="space-y-4 border-t border-slate-200 pt-5">
          <h3 className="font-semibold text-ink">3. ゲスト対応</h3>
          <label className="block text-sm text-slate-700">
            LINEメッセージへの返信方法
            <select name="replyMode" defaultValue="approval" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="approval">承認してから返信</option>
              <option value="auto">AIが自動返信</option>
            </select>
          </label>
          <label className="block text-sm text-slate-700">
            ハウスルール・ゲスト対応メモ
            <textarea name="houseRulesText" rows={5} maxLength={20000} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </section>

        <section className="space-y-2 border-t border-slate-200 pt-5">
          <h3 className="font-semibold text-ink">鍵番号の自動送信ルール</h3>
          <p className="text-sm leading-6 text-slate-600">
            鍵番号はBeds24から取得し、チェックイン7日前以降に、支払い確認・宿泊者名簿の全員分提出・ゲストのLINE連携が揃った予約へ送ります。条件が揃うまでは送信されません。
          </p>
        </section>

        {(isAdmin || !billingExempt) && (
          <label className="flex items-start gap-2 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-700">
            <input
              name="billingConsent"
              type="checkbox"
              value="yes"
              required={!selectedAccountExempt}
              className="mt-1"
            />
            <span>
              1アカウント基本料金は月額{BASE_PRICE_JPY.toLocaleString("ja-JP")}円（税込）です。2〜
              {MAX_PROPERTIES_PER_ACCOUNT}物件の場合、物件数にかかわらず月額
              {MULTI_PROPERTY_ADDON_JPY.toLocaleString("ja-JP")}円（税込）を追加します（合計月額
              {MULTI_PROPERTY_PRICE_JPY.toLocaleString("ja-JP")}円）。登録により料金が変わる場合、契約中のStripe請求額に反映されます。
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={pending || propertyLimitReached}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "連携を確認・登録中…" : propertyLimitReached ? "物件登録上限に達しています" : "物件と連携を登録"}
        </button>
      </form>
    </div>
  );
}
