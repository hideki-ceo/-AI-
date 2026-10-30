"use client";

import { useEffect, useState } from "react";

type Property = { id: string; name: string; minpaku_registration_no: string | null };
type Report = {
  property: string;
  year: number;
  period: string;
  startDate: string;
  endDateExclusive: string;
  bookingCount: number;
  guestNights: number;
  operatingDays: number;
  nationalityBreakdown: Record<string, { guests: number; guestNights: number }>;
};

const PERIODS = [1, 2, 3, 4, 5, 6].map((period) => ({
  value: period,
  label: `${period * 2 - 1}月・${period * 2}月`,
}));
const UNSUBMITTED = "未提出";

// 報告期限（偶数月の翌15日）があるため、既定は直前に終わった2か月にする
function previousPeriod(): { year: number; period: number } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const current = Math.ceil((now.getMonth() + 1) / 2);
  return current === 1 ? { year: now.getFullYear() - 1, period: 6 } : { year: now.getFullYear(), period: current - 1 };
}

function lastDay(endDateExclusive: string): string {
  const date = new Date(`${endDateExclusive}T00:00:00.000Z`);
  return new Date(date.getTime() - 86_400_000).toISOString().slice(0, 10);
}

export function ComplianceReportClient({ properties }: { properties: Property[] }) {
  const initial = previousPeriod();
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [year, setYear] = useState(initial.year);
  const [period, setPeriod] = useState(initial.period);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ propertyId, year: String(year), period: String(period) });
    fetch(`/api/reports/compliance?${query}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("集計を読み込めませんでした。");
        return (await response.json()) as Report;
      })
      .then((result) => {
        if (!cancelled) setReport(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setReport(null);
          setError(caught instanceof Error ? caught.message : "集計を読み込めませんでした。");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, year, period]);

  if (!properties.length) {
    return <p className="mt-8 rounded-lg bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-200">登録済みの物件がありません。</p>;
  }

  const property = properties.find((item) => item.id === propertyId);
  const nationalities = Object.entries(report?.nationalityBreakdown ?? {}).sort(
    ([, a], [, b]) => b.guestNights - a.guestNights,
  );
  const totalGuests = nationalities.reduce((sum, [, totals]) => sum + totals.guests, 0);
  const unsubmitted = report?.nationalityBreakdown[UNSUBMITTED]?.guests ?? 0;
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, index) => thisYear - index);
  const months = [period * 2 - 1, period * 2];

  return (
    <section className="mt-8 space-y-6">
      <div className="grid gap-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:grid-cols-3 print:hidden">
        <label className="block text-sm text-slate-700">
          物件
          <select
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            {properties.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-slate-700">
          年
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            {years.map((item) => (
              <option key={item} value={item}>{item}年</option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-slate-700">
          報告対象の期間
          <select
            value={period}
            onChange={(event) => setPeriod(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            {PERIODS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-500 print:hidden">集計中…</p>}

      {report && !loading && (
        <>
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-lg font-bold text-ink">{report.property}</h2>
                <p className="text-sm text-slate-600">
                  届出番号: {property?.minpaku_registration_no ?? "未登録"}
                </p>
                <p className="text-sm text-slate-600">
                  対象期間: {report.startDate} ～ {lastDay(report.endDateExclusive)}
                </p>
              </div>
              <button
                onClick={() => window.print()}
                className="self-start rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-ink print:hidden"
              >
                この画面を印刷
              </button>
            </div>

            {unsubmitted > 0 && (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                名簿が未提出の宿泊者が {unsubmitted} 名います。国籍が確定しないため「{UNSUBMITTED}」として集計しています。
              </p>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "宿泊日数", value: report.operatingDays, unit: "日" },
                { label: "宿泊者数", value: totalGuests, unit: "人" },
                { label: "延べ宿泊者数", value: report.guestNights, unit: "人泊" },
                { label: "予約件数", value: report.bookingCount, unit: "件" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
                  <dt className="text-xs text-slate-500">{item.label}</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums text-ink">
                    {item.value.toLocaleString("ja-JP")}
                    <span className="ml-1 text-sm font-normal text-slate-500">{item.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>

            <h3 className="mt-6 font-semibold text-ink">国籍別の内訳</h3>
            {nationalities.length ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">国籍</th>
                      <th className="py-2 pr-4 text-right font-medium">宿泊者数</th>
                      <th className="py-2 pr-4 text-right font-medium">延べ宿泊者数</th>
                      <th className="py-2 text-right font-medium">割合（延べ）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nationalities.map(([nationality, totals]) => (
                      <tr key={nationality} className="border-b border-slate-100">
                        <td className={`py-2 pr-4 ${nationality === UNSUBMITTED ? "text-amber-700" : "text-ink"}`}>
                          {nationality}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{totals.guests.toLocaleString("ja-JP")}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{totals.guestNights.toLocaleString("ja-JP")}</td>
                        <td className="py-2 text-right tabular-nums">
                          {report.guestNights ? ((totals.guestNights / report.guestNights) * 100).toFixed(1) : "0.0"}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">この期間の宿泊はありません。</p>
            )}
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:hidden">
            <h3 className="font-semibold text-ink">宿泊者名簿（月別）</h3>
            <p className="mt-1 text-sm text-slate-600">チェックイン月ごとに出力します。PDF はブラウザで開いてそのまま印刷できます。</p>
            <ul className="mt-4 space-y-3">
              {months.map((month) => {
                const query = new URLSearchParams({ propertyId, year: String(year), month: String(month) });
                return (
                  <li key={month} className="flex flex-wrap items-center gap-3">
                    <span className="w-16 text-sm font-medium text-ink">{month}月</span>
                    <a
                      href={`/api/reports/guest-register?${query}&format=pdf`}
                      target="_blank"
                      rel="noopener"
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      PDF
                    </a>
                    <a
                      href={`/api/reports/guest-register?${query}&format=csv`}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-ink"
                    >
                      CSV
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
