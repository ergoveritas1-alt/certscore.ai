import { Badge } from "@website-signal-risk-scanner/ui";
import type { ReactNode } from "react";

type ScanPageHeaderProps = {
  actions?: ReactNode;
  autoRefresh?: ReactNode;
  createdAtLabel?: string | null;
  status: string;
  title: string;
};

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusTone(status: string): "success" | "warning" {
  return status === "completed" ? "success" : "warning";
}

export function ScanPageHeader({ actions, autoRefresh, createdAtLabel, status, title }: ScanPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="space-y-3">
        <Badge tone={getStatusTone(status)}>{formatStatus(status)}</Badge>
        <div className="flex flex-wrap items-end gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {createdAtLabel ? <span className="text-sm font-normal text-slate-400">{createdAtLabel}</span> : null}
        </div>
        {autoRefresh}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
