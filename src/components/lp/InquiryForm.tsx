"use client";

import { useState, type FormEvent } from "react";

export function InquiryForm() {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      if (!response.ok) {
        setMessage("送信に失敗しました。入力内容をご確認のうえ、もう一度お試しください。");
        return;
      }
      formElement.reset();
      setMessage("お問い合わせを受け付けました。ありがとうございます。");
    } catch {
      setMessage("通信に失敗しました。時間をおいてもう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
      <label className="text-sm font-medium">
        お名前 <span className="text-red-200">*</span>
        <input name="name" required maxLength={120} autoComplete="name" className="mt-1 w-full rounded-lg px-3 py-2 text-ink" />
      </label>
      <label className="text-sm font-medium">
        メールアドレス <span className="text-red-200">*</span>
        <input name="email" type="email" required maxLength={254} autoComplete="email" className="mt-1 w-full rounded-lg px-3 py-2 text-ink" />
      </label>
      <label className="text-sm font-medium">
        会社・屋号
        <input name="company" maxLength={160} autoComplete="organization" className="mt-1 w-full rounded-lg px-3 py-2 text-ink" />
      </label>
      <label className="text-sm font-medium">
        管理物件数
        <input name="property_count" type="number" min="1" max="10000" inputMode="numeric" className="mt-1 w-full rounded-lg px-3 py-2 text-ink" />
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        ご相談内容
        <textarea name="message" rows={3} maxLength={2000} className="mt-1 w-full rounded-lg px-3 py-2 text-ink" />
      </label>
      <div className="sm:col-span-2">
        <button disabled={submitting} className="w-full rounded-full bg-white px-8 py-3.5 font-semibold text-brand-700 shadow-lg transition hover:bg-brand-50 disabled:opacity-60">
          {submitting ? "送信中…" : "相談を送信する"}
        </button>
        <p role="status" aria-live="polite" className="mt-3 text-center text-sm text-white">{message}</p>
      </div>
    </form>
  );
}
