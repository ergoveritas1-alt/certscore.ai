"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Props = { basePath: string; children: ReactNode; label?: string };

export function AdminTableRefreshBoundary({ basePath, children, label = "Refreshing table" }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setIsRefreshing(false);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function onSubmit(event: Event) {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (form?.dataset.adminTableForm === basePath) {
        setIsRefreshing(true);
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => setIsRefreshing(false), 10_000);
      }
    }
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [basePath]);

  return (
    <div className="relative min-w-0">
      {children}
      {isRefreshing ? (
        <div aria-busy="true" aria-label={label} className="absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-white/65 pt-24 backdrop-blur-[1px]">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">{label}…</span>
        </div>
      ) : null}
    </div>
  );
}
