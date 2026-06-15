import { Badge } from "@website-signal-risk-scanner/ui";
import React, { type ReactNode } from "react";
import { ScanFromMarker } from "./scan-from-icons";

type ScanPageHeaderProps = {
  actions?: ReactNode;
  actionsPlacement?: "end" | "belowTitle";
  autoRefresh?: ReactNode;
  createdAtLabel?: ReactNode;
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

function getScanFromMarkerInput(value: string | undefined) {
  switch (value) {
    case "eu":
      return { flag: "🇪🇺" };
    case "uk":
      return { flag: "🇬🇧" };
    case "california":
      return { flag: "california" };
    case "local_extension":
      return { icon: "local" as const };
    case "default":
    default:
      return { icon: "cloud" as const };
  }
}

function ScanOriginIcon() {
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
  scanFromLabel,
  scanFromValue,
  status,
  statusLabel,
  statusTone,
  title
}: ScanPageHeaderProps) {
  const scanFromMarker = getScanFromMarkerInput(scanFromValue);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-3xl font-semibold tracking-tight">{title}</h1>
          <Badge tone={statusTone ?? getStatusTone(status)}>{statusLabel ?? formatStatus(status)}</Badge>
          {scanFromLabel ? (
            <span aria-label={`Scan source: ${scanFromLabel}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm shadow-slate-200/50" title={`Scan source: ${scanFromLabel}`}>
              <ScanOriginIcon />
              <ScanFromMarker
                flag={"flag" in scanFromMarker ? scanFromMarker.flag : undefined}
                icon={"icon" in scanFromMarker ? scanFromMarker.icon : undefined}
                selected
              />
            </span>
          ) : null}
        </div>
        {createdAtLabel ? <div className="flex flex-wrap items-center gap-1.5 text-sm font-normal text-slate-400">{createdAtLabel}</div> : null}
        {actionsPlacement === "belowTitle" ? actions : null}
        {autoRefresh}
      </div>
      {actions && actionsPlacement === "end" ? <div>{actions}</div> : null}
    </div>
  );
}
