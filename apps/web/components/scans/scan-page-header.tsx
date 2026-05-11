import { Badge } from "@website-signal-risk-scanner/ui";
import React, { type ReactNode } from "react";

type ScanPageHeaderProps = {
  actions?: ReactNode;
  autoRefresh?: ReactNode;
  createdAtLabel?: ReactNode;
  statusLabel?: string;
  statusTone?: "success" | "warning";
  status: string;
  title: string;
};

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusTone(status: string): "success" | "warning" {
  return status === "completed" ? "success" : "warning";
}

export function ScanPageHeader({
  actions,
  autoRefresh,
  createdAtLabel,
  status,
  statusLabel,
  statusTone,
  title
}: ScanPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <Badge tone={statusTone ?? getStatusTone(status)}>{statusLabel ?? formatStatus(status)}</Badge>
          {createdAtLabel ? <span className="text-sm font-normal text-slate-400">{createdAtLabel}</span> : null}
        </div>
        {autoRefresh}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
