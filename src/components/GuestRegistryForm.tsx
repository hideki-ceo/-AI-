"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { isJapaneseNationality } from "@/lib/guest-registry";

type Guest = {
  full_name: string;
  address: string;
  gender: string;
  phone_number: string;
  nationality: string;
  passport_number: string;
  passport_image_key: string;
};

const emptyGuest = (): Guest => ({
  full_name: "",
  address: "",
  gender: "",
  phone_number: "",
  nationality: "",
  passport_number: "",
  passport_image_key: "",
});

export function GuestRegistryForm({
  bookingId,
  numGuests,
  isCompleted,
}: {
  bookingId: string;
  numGuests: number;
  isCompleted: boolean;
}) {
  const [guests, setGuests] = useState(() => Array.from({ length: numGuests }, emptyGuest));
  const [files, setFiles] = useState<(File | null)[]>(() => Array.from({ length: numGuests }, () => null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(isCompleted);

  function updateGuest(index: number, field: keyof Guest, value: string) {
    setGuests((current) => current.map((guest, i) => (i === index ? { ...guest, [field]: value } : guest)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const entries = await Promise.all(
        guests.map(async (guest, index) => {
          if (isJapaneseNationality(guest.nationality)) {
            return { ...guest, passport_number: null, passport_image_key: null };
          }
          const file = files[index];
          if (!file) throw new Error(`${index + 1}人目のパスポート画像を選択してください。`);
          if (file.size > 10 * 1024 * 1024) throw new Error("画像ファイルは10MB以下にしてください。");
          const uploadResponse = await fetch(`/api/guest-registry/${bookingId}/upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contentType: file.type }),
          });
          if (!uploadResponse.ok) throw new Error("画像のアップロード準備に失敗しました。");
          const { path, token } = (await uploadResponse.json()) as { path: string; token: string };
          const { error: uploadError } = await supabase.storage
            .from("passports")
            .uploadToSignedUrl(path, token, file, { contentType: file.type });
          if (uploadError) throw new Error("パスポート画像を安全にアップロードできませんでした。");
          return { ...guest, passport_image_key: path };
        }),
      );

      const response = await fetch(`/api/guest-registry/${bookingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guests: entries }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? "登録に失敗しました。入力内容をご確認ください。");
      }
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登録に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div role="status" className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-lg font-bold text-ink">宿泊者情報を受け付けました</p>
        <p className="mt-2 text-sm text-slate-600">決済状況も確認後、チェックインの1週間前から鍵番号をご案内します。</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {guests.map((guest, index) => (
        <fieldset key={index} className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 sm:p-7">
          <legend className="px-2 font-bold text-ink">{index === 0 ? "代表者" : `ゲスト ${index + 1}`}</legend>
          <Field label="氏名">
            <input required maxLength={200} value={guest.full_name} onChange={(e) => updateGuest(index, "full_name", e.target.value)} />
          </Field>
          <Field label="性別">
            <select required value={guest.gender} onChange={(e) => updateGuest(index, "gender", e.target.value)}>
              <option value="">選択してください</option>
              <option value="男性">男性</option>
              <option value="女性">女性</option>
              <option value="その他">その他</option>
              <option value="回答しない">回答しない</option>
            </select>
          </Field>
          <Field label="住所">
            <input required maxLength={500} autoComplete="street-address" value={guest.address} onChange={(e) => updateGuest(index, "address", e.target.value)} />
          </Field>
          <Field label="電話番号">
            <input required type="tel" maxLength={40} autoComplete="tel" value={guest.phone_number} onChange={(e) => updateGuest(index, "phone_number", e.target.value)} />
          </Field>
          <Field label="国籍（例：日本、米国）">
            <input required maxLength={100} value={guest.nationality} onChange={(e) => updateGuest(index, "nationality", e.target.value)} />
          </Field>
          {!isJapaneseNationality(guest.nationality) && (
            <>
              <Field label="パスポート番号">
                <input required maxLength={100} value={guest.passport_number} onChange={(e) => updateGuest(index, "passport_number", e.target.value)} />
              </Field>
              <Field label="パスポート画像（JPEG / PNG / WebP・10MB以下）">
                <input
                  required
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setFiles((current) => current.map((file, i) => (i === index ? e.target.files?.[0] ?? null : file)))}
                />
              </Field>
            </>
          )}
        </fieldset>
      ))}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-brand-600 px-6 py-4 font-bold text-white hover:bg-brand-700 disabled:opacity-60">
        {busy ? "送信中…" : "全員分を登録する"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}
