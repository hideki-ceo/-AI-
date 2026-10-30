"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("メールアドレスまたはパスワードが正しくありません。");
      setBusy(false);
      return;
    }
    router.replace(redirectTo);
    router.refresh();
  }

  async function sendPasswordReset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
      });
      if (resetError) {
        setError("再設定メールを送信できませんでした。時間をおいて再度お試しください。");
      } else {
        setMessage("登録されている場合は、再設定用メールを送信しました。受信箱をご確認ください。");
      }
    } catch {
      setError("再設定メールを送信できませんでした。通信状況を確認して再度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  if (resetMode) {
    return (
      <form onSubmit={(event) => void sendPasswordReset(event)} className="mt-6 space-y-4">
        <p className="text-sm text-slate-600">登録したメールアドレスに、パスワード再設定用のリンクを送信します。</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
        <label className="block text-sm text-slate-700">
          メールアドレス
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "送信中…" : "再設定メールを送信"}
        </button>
        <button
          type="button"
          onClick={() => {
            setResetMode(false);
            setError("");
            setMessage("");
          }}
          className="w-full py-1 text-sm text-slate-600 hover:text-ink"
        >
          ログインに戻る
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label className="block text-sm text-slate-700">
        メールアドレス
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-slate-700">
        パスワード
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "ログイン中…" : "ログイン"}
      </button>
      <button
        type="button"
        onClick={() => {
          setResetMode(true);
          setError("");
        }}
        className="w-full py-1 text-sm text-brand-700 hover:underline"
      >
        パスワードを忘れた場合
      </button>
      <Link href="/signup" className="block text-center text-sm text-slate-600 hover:underline">
        新規登録はこちら
      </Link>
    </form>
  );
}
