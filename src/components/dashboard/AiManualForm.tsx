"use client";

import { useActionState, useEffect, useState } from "react";
import { savePropertyAiManualAction, type AiManualState } from "@/app/dashboard/settings/actions";

type PropertySummary = {
  id: string;
  property_name: string;
  house_rules_text: string | null;
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

  useEffect(() => {
    const next = properties.find((property) => property.id === selectedId);
    setManualText(next?.house_rules_text ?? "");
  }, [selectedId, properties]);

  const selectedProperty = properties.find((property) => property.id === selectedId) ?? properties[0];

  return (
    <form action={action} className="space-y-5 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      {state?.success && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {state.success}
        </p>
      )}

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
          <p className="text-xs text-slate-500">AIが参照するマニュアルは、この物件のLINE回答のみで使われます。</p>
        )}
      </div>

      <label className="block text-sm text-slate-700">
        AIマニュアル
        <textarea
          name="houseRulesText"
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          rows={16}
          maxLength={20000}
          placeholder="例: 1. 早朝の連絡には応答しない、2. 鍵の返却は必ず玄関前で行う、3. 緊急時は119/110に連絡してから管理者へ連絡する"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
        />
      </label>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-500">{manualText.length}/20,000</p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
      </div>
    </form>
  );
}
