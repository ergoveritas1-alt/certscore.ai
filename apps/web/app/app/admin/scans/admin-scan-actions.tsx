"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

type AdminScanActionsProps = {
  scanId: string;
  scanViewHref: string;
};

function SimpleScanIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12s3.3-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.3 5.5-9.5 5.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SnapshotInspectIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="11" height="14" rx="2" />
      <path d="M7.5 8h4" />
      <path d="M7.5 11.5h3" />
      <circle cx="16.5" cy="16.5" r="3" />
      <path d="m19 19 2 2" />
    </svg>
  );
}

function ActionButton({
  children,
  href,
  label,
  onNavigate
}: {
  children: ReactNode;
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    onNavigate();
  }

  return (
    <div className="group relative inline-flex">
      <Link
        aria-label={label}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-950"
        href={href}
        onClick={handleClick}
        title={label}
      >
        {children}
      </Link>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg group-hover:block">
        {label}
      </div>
    </div>
  );
}

export function AdminScanActions({ scanId, scanViewHref }: AdminScanActionsProps) {
  const pathname = usePathname();
  const [openingLabel, setOpeningLabel] = useState<string | null>(null);

  useEffect(() => {
    setOpeningLabel(null);
  }, [pathname]);

  useEffect(() => {
    if (!openingLabel) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setOpeningLabel(null);
    }, 10_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [openingLabel]);

  return (
    <>
      <div className="flex items-center gap-2">
        <ActionButton href={scanViewHref} label="Open simple scan view" onNavigate={() => setOpeningLabel("Opening scan view...")}>
          <SimpleScanIcon />
        </ActionButton>
        <ActionButton href={`/app/admin/scans/${scanId}`} label="Inspect snapshot" onNavigate={() => setOpeningLabel("Opening snapshot...")}>
          <SnapshotInspectIcon />
        </ActionButton>
      </div>
      {openingLabel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="rounded-2xl border border-white/20 bg-white px-6 py-5 text-center shadow-2xl">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
            <p className="text-sm font-medium text-slate-900">{openingLabel}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
