"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type AdminScanActionsProps = {
  compact?: boolean;
  scanId: string;
  scanViewHref: string;
};

type AdminNavigationState = {
  href: string;
  label: string;
} | null;

type AdminNavigationContextValue = {
  beginNavigation: (href: string, label: string) => boolean;
  openingHref: string | null;
};

const AdminNavigationContext = createContext<AdminNavigationContextValue | null>(null);

function useAdminNavigation() {
  const value = useContext(AdminNavigationContext);
  if (!value) throw new Error("Admin navigation actions must be rendered inside AdminNavigationProvider.");
  return value;
}

export function AdminNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navigation, setNavigation] = useState<AdminNavigationState>(null);

  useEffect(() => {
    setNavigation(null);
  }, [pathname]);

  useEffect(() => {
    if (!navigation) return;
    const timeoutId = window.setTimeout(() => setNavigation(null), 10_000);
    return () => window.clearTimeout(timeoutId);
  }, [navigation]);

  function beginNavigation(href: string, label: string) {
    if (navigation) return false;
    setNavigation({ href, label });
    return true;
  }

  const overlay = navigation && typeof document !== "undefined"
    ? createPortal(
      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm" role="status" aria-live="polite">
        <div className="rounded-2xl border border-white/20 bg-white px-6 py-5 text-center shadow-2xl">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-900">{navigation.label}</p>
          <p className="mt-1 text-xs text-slate-500">This will clear automatically if navigation cannot complete.</p>
        </div>
      </div>,
      document.body
    )
    : null;

  return (
    <AdminNavigationContext.Provider value={{ beginNavigation, openingHref: navigation?.href ?? null }}>
      {children}
      {overlay}
    </AdminNavigationContext.Provider>
  );
}

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
  compact = false
}: {
  children: ReactNode;
  href: string;
  label: string;
  compact?: boolean;
}) {
  const { beginNavigation, openingHref } = useAdminNavigation();
  const navigationPending = openingHref !== null;

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
    if (!beginNavigation(href, label === "Inspect snapshot" ? "Opening snapshot..." : "Opening scan report...")) {
      event.preventDefault();
    }
  }

  return (
    <div className="group/action relative inline-flex">
      <Link
        aria-label={label}
        aria-disabled={navigationPending}
        className={`app-raised-button inline-flex items-center justify-center rounded-full text-slate-700 hover:text-slate-950 ${navigationPending ? "cursor-wait opacity-60" : ""} ${compact ? "h-8 w-8 [&_svg]:h-4 [&_svg]:w-4" : "h-10 w-10"}`}
        href={href}
        onClick={handleClick}
        title={label}
      >
        {children}
      </Link>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg group-hover/action:block">
        {label}
      </div>
    </div>
  );
}

export function AdminScanActions({ compact = false, scanId, scanViewHref }: AdminScanActionsProps) {
  return (
    <div className={`flex items-center ${compact ? "gap-1" : "gap-2"}`}>
      <ActionButton compact={compact} href={scanViewHref} label="Open scan report">
        <SimpleScanIcon />
      </ActionButton>
      <ActionButton compact={compact} href={`/app/admin/scans/${scanId}`} label="Inspect snapshot">
        <SnapshotInspectIcon />
      </ActionButton>
    </div>
  );
}

export function AdminReportLink({
  ariaLabel,
  children,
  className,
  href
}: {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  href: string;
}) {
  const { beginNavigation, openingHref } = useAdminNavigation();
  const navigationPending = openingHref !== null;

  return (
    <Link
      aria-disabled={navigationPending}
      aria-label={ariaLabel}
      className={`app-raised-button ${className} ${navigationPending ? "cursor-wait opacity-60" : ""}`}
      href={href}
      onClick={(event) => {
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
        if (!beginNavigation(href, href.startsWith("/app/scans/") ? "Opening scan report..." : "Opening API request...")) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </Link>
  );
}
