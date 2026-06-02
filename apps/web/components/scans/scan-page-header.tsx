import { Badge } from "@website-signal-risk-scanner/ui";
import React, { type ReactNode } from "react";

type ScanPageHeaderProps = {
  actions?: ReactNode;
  actionsPlacement?: "end" | "belowTitle";
  autoRefresh?: ReactNode;
  createdAtLabel?: ReactNode;
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

export function ScanPageHeader({
  actions,
  actionsPlacement = "end",
  autoRefresh,
  createdAtLabel,
  status,
  statusLabel,
  statusTone,
  title
}: ScanPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-3xl font-semibold tracking-tight">{title}</h1>
          <Badge tone={statusTone ?? getStatusTone(status)}>{statusLabel ?? formatStatus(status)}</Badge>
          {createdAtLabel ? <span className="text-sm font-normal text-slate-400">{createdAtLabel}</span> : null}
        </div>
        {actionsPlacement === "belowTitle" ? actions : null}
        {autoRefresh}
      </div>
      {actions && actionsPlacement === "end" ? <div>{actions}</div> : null}
    </div>
  );
}
