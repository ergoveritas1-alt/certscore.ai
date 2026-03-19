"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const navItems = [
  { href: "/app", label: "Overview", shortLabel: "OV" },
  { href: "/app/scans", label: "All scans", shortLabel: "SC" },
  { href: "/app/issues", label: "Issue analytics", shortLabel: "IA" },
  { href: "/app/changes", label: "Audit history", shortLabel: "AH" }
] as const;

export function ValidationAppShell(input: {
  children: ReactNode;
  userEmail: string;
}) {
  const pathname = usePathname();
  const [navCollapsed, setNavCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.18),_transparent_35%),linear-gradient(180deg,#082f49_0%,#0f172a_45%,#020617_100%)] text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setNavCollapsed((value) => !value)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-sm font-semibold text-slate-100 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
              aria-pressed={navCollapsed}
            >
              {navCollapsed ? "»" : "«"}
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-teal-200/80">Validation Ops</p>
              <h1 className="text-lg font-semibold text-white">Agentic scan verifier</h1>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm text-slate-300">
            <div>{input.userEmail}</div>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-100 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-8">
        <aside className={`${navCollapsed ? "w-20" : "w-56"} shrink-0 transition-[width] duration-200`}>
          <nav className="space-y-2">
            {navItems.map((item) => {
              const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={navCollapsed ? item.label : undefined}
                  className={`block rounded-2xl border px-4 py-3 text-sm transition ${
                    active
                      ? "border-teal-300/30 bg-teal-300/10 text-white"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
                  } ${navCollapsed ? "text-center" : ""}`}
                >
                  {navCollapsed ? item.shortLabel : item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{input.children}</main>
      </div>
    </div>
  );
}
