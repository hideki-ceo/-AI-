"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
import { savePropertyAiManualAction, type AiManualState } from "@/app/dashboard/settings/actions";

type PropertySummary = {
  id: string;
  property_name: string;
  house_rules_text: string | null;
  prebooking_rules_text: string | null;
};

type AiDocument = {
  id: string;
  file_name: string;
  size_bytes: number;
  created_at: string;
};

const initialState: AiManualState = null;

export function AiManualForm({
  properties,
  selectedPropertyId,
}: {
  properties: PropertySummary[];
  selectedPropertyId: string;
}) {
  const [state, action, pending] = useActionState(savePropertyAiManualAction, initialState);
  const [selectedId, setSelectedId] = useState(selectedPropertyId);
  const [manualText, setManualText] = useState(
    properties.find((property) => property.id === selectedPropertyId)?.house_rules_text ?? "",
  );
  const [prebookingText, setPrebookingText] = useState(
    properties.find((property) => property.id === selectedPropertyId)?.prebooking_rules_text ?? "",
  );
  const [documents, setDocuments] = useState<AiDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [documentSuccess, setDocumentSuccess] = useState("");

  useEffect(() => {
    const next = properties.find((property) => property.id === selectedId);
    setManualText(next?.house_rules_text ?? "");
    setPrebookingText(next?.prebooking_rules_text ?? "");
  }, [selectedId, properties]);

  useEffect(() => {
    let active = true;
    async function loadDocuments() {
      setDocumentsLoading(true);
      setDocumentError("");
      setDocumentSuccess("");
      try {
        const response = await fetch(`/api/properties/${selectedId}/ai-documents`);
        const result = (await response.json()) as { documents?: AiDocument[]; error?: string };
        if (!response.ok || !result.documents) throw new Error(result.error ?? "資料を読み込めませんでした。");
        if (active) setDocuments(result.documents);
      } catch (error) {
        if (active) {
          setDocuments([]);
          setDocumentError(error instanceof Error ? error.message : "資料を読み込めませんでした。");
        }
      } finally {
        if (active) setDocumentsLoading(false);
      }
    }
    void loadDocuments();
    return () => {
      active = false;
    };
  }, [selectedId]);

  const selectedProperty = properties.find((property) => property.id === selectedId) ?? properties[0];

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDocumentError("");
    setDocumentSuccess("");
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || !file.name) {
      setDocumentError("アップロードするファイルを選択してください。");
      return;
    }

    setUploading(true);
    try {
      const response = await fetch(`/api/properties/${selectedId}/ai-documents`, {
        method: "POST",
        body: new FormData(form),
      });
      const result = (await response.json()) as { document?: AiDocument; error?: string };
      if (!response.ok || !result.document) throw new Error(result.error ?? "資料をアップロードできませんでした。");
      const uploadedDocument = result.document;
      setDocuments((current) => [...current, uploadedDocument]);
      setDocumentSuccess("資料をアップロードしました。");
      form.reset();
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "資料をアップロードできませんでした。");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(documentId: string) {
    setDocumentError("");
    setDocumentSuccess("");
    setDeletingId(documentId);
    try {
      const response = await fetch(`/api/properties/${selectedId}/ai-documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "資料を削除できませんでした。");
      setDocuments((current) => current.filter((document) => document.id !== documentId));
      setDocumentSuccess("資料を削除しました。");
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "資料を削除できませんでした。");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <div className="space-y-2">
          <label className="block text-sm text-slate-700">
            対象物件
            <select
              name="propertyId"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.property_name}
                </option>
              ))}
            </select>
          </label>
          {selectedProperty && (
            <p className="text-xs text-slate-500">
              予約済みゲストには宿泊中のAIマニュアルを、予約未紐付けの方には予約前ルールと資料を使います。
            </p>
          )}
        </div>

        <form action={action} className="space-y-5">
          <input type="hidden" name="propertyId" value={selectedId} />
          {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
          {state?.success && (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.success}</p>
          )}

          <label className="block text-sm text-slate-700">
            宿泊中のゲスト向けAIマニュアル
            <textarea
              name="houseRulesText"
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              rows={8}
              maxLength={20000}
              placeholder="宿泊中の案内、ハウスルール、緊急時の対応など"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </label>

          <label className="block text-sm text-slate-700">
            予約前問い合わせのAI応答ルール
            <textarea
              name="prebookingRulesText"
              value={prebookingText}
              onChange={(event) => setPrebookingText(event.target.value)}
              rows={8}
              maxLength={20000}
              placeholder="例: 予約方法、問い合わせへの回答トーン、確認が必要な質問は人に引き継ぐこと"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-500">
              宿泊中 {manualText.length}/20,000・予約前 {prebookingText.length}/20,000
            </p>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {pending ? "保存中..." : "ルールを保存"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-ink">予約前問い合わせの参照資料</h2>
          <p className="mt-1 text-sm text-slate-600">
            PDF・DOCX・TXT・Markdownを最大10件、1件10MBまで登録できます。資料は非公開で保存し、予約前のAI回答にだけ参照します。スキャン画像のみのPDFは読み取れません。
          </p>
        </div>
        {documentError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{documentError}</p>}
        {documentSuccess && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{documentSuccess}</p>}

        <form onSubmit={(event) => void uploadDocument(event)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm text-slate-700">
            AIが参照する資料ファイル
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={uploading || documents.length >= 10}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? "アップロード中..." : "ファイルをアップロード"}
          </button>
        </form>

        {documentsLoading ? (
          <p className="text-sm text-slate-500">資料を読み込み中...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-500">アップロード済みの資料はありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{document.file_name}</p>
                  <p className="text-xs text-slate-500">
                    {(document.size_bytes / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteDocument(document.id)}
                  disabled={deletingId !== "" || uploading}
                  className="shrink-0 rounded-md px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === document.id ? "削除中..." : "削除"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
