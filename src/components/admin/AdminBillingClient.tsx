"use client";

import { useEffect, useState } from "react";

type Tenant = {
  id: string;
  name: string;
  email: string;
  is_free_tier: boolean;
  free_reason: string | null;
};
type Property = {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  is_exempt_from_billing: boolean;
  management_contract_ref: string | null;
};

export function AdminBillingClient() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [contracts, setContracts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/billing");
    if (!response.ok) throw new Error("管理データを読み込めませんでした。");
    const result = (await response.json()) as { tenants: Tenant[]; properties: Property[] };
    setTenants(result.tenants);
    setProperties(result.properties);
  }

  useEffect(() => {
    void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "読み込みに失敗しました。"));
  }, []);

  async function toggleTenant(tenant: Tenant) {
    setBusy(tenant.id);
    setError("");
    const enabled = !tenant.is_free_tier;
    const response = await fetch("/api/admin/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "tenant",
        id: tenant.id,
        enabled,
        reason: reasons[tenant.id] ?? tenant.free_reason ?? "",
      }),
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(result?.error ?? "テナント設定を更新できませんでした。");
    } else {
      await load();
    }
    setBusy(null);
  }

  async function toggleProperty(property: Property) {
    setBusy(property.id);
    setError("");
    const enabled = !property.is_exempt_from_billing;
    const response = await fetch("/api/admin/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "property",
        id: property.id,
        enabled,
        management_contract_ref: contracts[property.id] ?? property.management_contract_ref ?? "",
      }),
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(result?.error ?? "物件設定を更新できませんでした。");
    } else {
      await load();
    }
    setBusy(null);
  }

  return (
    <section className="mt-8 space-y-8">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-ink">テナント単位の無料アクセス</h2>
        {tenants.map((tenant) => (
          <article key={tenant.id} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-semibold text-ink">{tenant.name}</h3>
                <p className="text-sm text-slate-500">{tenant.email}</p>
                {tenant.is_free_tier && <p className="mt-1 text-xs text-brand-700">免除理由: {tenant.free_reason}</p>}
              </div>
              <button
                disabled={busy === tenant.id}
                onClick={() => void toggleTenant(tenant)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === tenant.id ? "更新中…" : tenant.is_free_tier ? "無料を解除" : "無料アクセスを有効化"}
              </button>
            </div>
            {!tenant.is_free_tier && (
              <label className="mt-4 block text-sm text-slate-700">
                無料理由（有効化時に必須）
                <input
                  value={reasons[tenant.id] ?? ""}
                  onChange={(event) => setReasons((current) => ({ ...current, [tenant.id]: event.target.value }))}
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            )}
          </article>
        ))}
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-ink">管理委託物件の課金免除</h2>
        {properties.map((property) => {
          const tenant = tenants.find((item) => item.id === property.tenant_id);
          return (
            <article key={property.id} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-semibold text-ink">{property.name}</h3>
                  <p className="text-sm text-slate-500">{tenant?.name ?? property.tenant_id} · {property.address}</p>
                  {property.is_exempt_from_billing && (
                    <p className="mt-1 text-xs text-brand-700">契約参照: {property.management_contract_ref}</p>
                  )}
                </div>
                <button
                  disabled={busy === property.id}
                  onClick={() => void toggleProperty(property)}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy === property.id ? "更新中…" : property.is_exempt_from_billing ? "免除を解除" : "課金を免除"}
                </button>
              </div>
              {!property.is_exempt_from_billing && (
                <label className="mt-4 block text-sm text-slate-700">
                  管理委託契約参照（免除時に必須）
                  <input
                    value={contracts[property.id] ?? ""}
                    onChange={(event) => setContracts((current) => ({ ...current, [property.id]: event.target.value }))}
                    maxLength={200}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
