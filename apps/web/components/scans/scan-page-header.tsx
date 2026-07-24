import { Badge } from "@website-signal-risk-scanner/ui";
import React, { type ReactNode } from "react";
import { getScanFromMarkerInput, ScanFromMarker } from "./scan-from-icons";

type ScanPageHeaderProps = {
  actions?: ReactNode;
  actionsPlacement?: "end" | "belowTitle";
  autoRefresh?: ReactNode;
  createdAtLabel?: ReactNode;
  leadingBadges?: ReactNode;
  scanFromLabel?: ReactNode;
  scanFromValue?: string;
  statusLabel?: string;
  statusTone?: "info" | "success" | "warning";
  status: string;
  title: ReactNode;
};

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusTone(status: string): "success" | "warning" {
  return status === "completed" ? "success" : "warning";
}


function getScanSourceContext(value: string | undefined) {
  switch (value) {
    case "eu_de":
    case "eu":
      return "Scan executed from Germany (EU); regional consent interfaces can differ for visitors in other locations.";
    case "eu_ie":
    case "uk":
      return "Scan executed from Ireland (EU); regional consent interfaces can differ for visitors in other locations.";
    case "california":
      return "Scan executed from California; regional consent interfaces can differ for visitors in other locations.";
    default:
      return null;
  }
}

function ScanOriginIcon({ browser }: { browser: boolean }) {
  if (browser) {
    return (
      <svg aria-hidden="true" className="h-3.5 w-3.5 text-sky-600" fill="none" viewBox="0 0 16 16">
        <rect height="10.5" rx="2" stroke="currentColor" strokeWidth="1.25" width="12" x="2" y="2.5" />
        <path d="M2.5 5.5h11" stroke="currentColor" strokeWidth="1.25" />
        <circle cx="8" cy="9" r="1.2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5.7 12.3c.55-1.05 1.32-1.55 2.3-1.55s1.75.5 2.3 1.55" stroke="currentColor" strokeLinecap="round" strokeWidth="1.1" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 16 16">
      <path d="M8 14s4-3.8 4-7A4 4 0 0 0 4 7c0 3.2 4 7 4 7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
      <circle cx="8" cy="7" r="1.35" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function ScanPageHeader({
  actions,
  actionsPlacement = "end",
  autoRefresh,
  createdAtLabel,
  leadingBadges,
  scanFromLabel,
  scanFromValue,
  status,
  statusLabel,
  statusTone,
  title
}: ScanPageHeaderProps) {
  const scanFromMarker = getScanFromMarkerInput(scanFromValue);
  const isBrowserExtensionScan = scanFromValue === "local_extension";
  const scanSourceContext = getScanSourceContext(scanFromValue);
  const scanSourceContextId = scanSourceContext ? `scan-source-context-${scanFromValue ?? "default"}` : undefined;

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {leadingBadges}
          <Badge tone={statusTone ?? getStatusTone(status)}>{statusLabel ?? formatStatus(status)}</Badge>
          {scanFromLabel ? (
            <span
              aria-describedby={scanSourceContextId}
              aria-label={`Scan source: ${scanFromLabel}`}
              className="group relative inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm shadow-slate-200/50 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2"
              tabIndex={scanSourceContext ? 0 : undefined}
              title={scanSourceContext ?? `Scan source: ${scanFromLabel}`}
            >
              <ScanOriginIcon browser={isBrowserExtensionScan} />
              <ScanFromMarker
                flag={"flag" in scanFromMarker ? scanFromMarker.flag : undefined}
                icon={"icon" in scanFromMarker ? scanFromMarker.icon : undefined}
                selected
              />
              {scanSourceContext ? (
                <span
                  className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-max max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium leading-5 text-slate-600 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                  id={scanSourceContextId}
                  role="tooltip"
                >
                  {scanSourceContext}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        {createdAtLabel ? <div className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-slate-400">{createdAtLabel}</div> : null}
        {actionsPlacement === "belowTitle" ? actions : null}
        {autoRefresh}
      </div>
      {actions && actionsPlacement === "end" ? <div>{actions}</div> : null}
    </div>
  );
}
