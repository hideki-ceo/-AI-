"use client";

import { useState } from "react";

export function SubscriptionCheckoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        setError("決済ページを開けませんでした。物件登録と決済設定をご確認ください。");
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("決済ページに接続できませんでした。通信状況を確認して再度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <button
        type="button"
        onClick={() => void checkout()}
        disabled={busy}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "決済ページを準備中…" : "Stripeで利用を開始"}
      </button>
    </div>
  );
}
