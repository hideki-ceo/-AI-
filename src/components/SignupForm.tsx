"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("確認用パスワードが一致しません。");
      return;
    }

    setBusy(true);
    try {
      const { data, error: signupError } = await createClient().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard/settings`,
        },
      });
      if (signupError) {
        setError(`アカウントを作成できませんでした: ${signupError.message}`);
        return;
      }

      if (data.session) {
        router.replace("/dashboard/settings");
        router.refresh();
      } else {
        setSubmitted(true);
      }
    } catch (signupException) {
      console.error("Unexpected error while creating an account", signupException);
      const detail =
        signupException instanceof Error && signupException.message
          ? ` (${signupException.message})`
          : "";
      setError(
        `アカウントを作成できませんでした${detail}。通信状況を確認して再度お試しください。`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-6 space-y-4">
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          登録処理を受け付けました。確認メールが届いている場合は、メール内のリンクを開いて登録を完了してください。
        </p>
        <p className="text-sm text-slate-600">メールが届かない場合は、迷惑メールフォルダーもご確認ください。</p>
        <Link href="/login" className="block text-center text-sm text-brand-700 hover:underline">
          ログイン画面に戻る
        </Link>
      </div>
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
        パスワード（8文字以上）
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-slate-700">
        パスワード（確認）
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "申し込みを準備中…" : "アカウントを作成して申し込む"}
      </button>
      <Link href="/login?next=/dashboard/settings" className="block text-center text-sm text-slate-600 hover:underline">
        すでにアカウントをお持ちの方はログイン
      </Link>
    </form>
  );
}
