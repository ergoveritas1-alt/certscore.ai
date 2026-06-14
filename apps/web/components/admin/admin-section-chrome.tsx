"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AdminSectionChromeProps = {
  children: ReactNode;
};

const navItems = [
  { href: "/app/admin", label: "Overview" },
  { href: "/app/admin/users", label: "Users" },
  { href: "/app/admin/scans", label: "Scans" },
  { href: "/app/admin/scanner-quality", label: "Scanner Quality" },
  { href: "/app/admin/v2-scan-lab", label: "v2 Scan Lab" },
  { href: "/app/admin/fintech", label: "Fintech" }
] as const;

export function AdminSectionChrome({ children }: AdminSectionChromeProps) {
  const pathname = usePathname() ?? "";
  const isFintechSection = pathname === "/app/admin/fintech" || pathname.startsWith("/app/admin/fintech/");

  if (isFintechSection) {
    return <div>{children}</div>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="max-w-3xl text-slate-600">
          Internal tooling for workspace administration and full snapshot inspection. This area is intentionally deeper than the customer-facing reporting surface.
        </p>
      </div>

      <nav className="flex flex-wrap gap-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
