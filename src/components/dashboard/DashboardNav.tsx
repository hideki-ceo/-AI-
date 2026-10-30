"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard/bookings", label: "予約一覧" },
  { href: "/dashboard/reports", label: "定期報告" },
  { href: "/dashboard/settings", label: "物件・連携設定" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm" aria-label="管理画面">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 font-medium ${
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
