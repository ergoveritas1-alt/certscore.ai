"use client";

import type { ReactNode } from "react";
import { FullSiteRegion, FullSiteTiming } from "./full-site-workspace";
import { ShareReportActions } from "./share-report-actions";
import { VendorBrandLogo } from "./vendor-brand-chip";

export function FullSiteIdentity({ scanId, host, url, createdAt, region, visualEvidenceHref, actions }: {
  scanId: string;
  host: string;
  url?: string | null;
  createdAt: string;
  region: ReactNode;
  visualEvidenceHref?: string | null;
  actions?: ReactNode;
}) {
  return <header className="space-y-2">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium text-zinc-500">
      <div className="min-h-[1.625rem] min-w-8 [&_.app-raised-button]:!h-[1.625rem] [&_.app-raised-button]:!rounded-md [&_.app-raised-button]:!border [&_.app-raised-button]:!border-zinc-300 [&_.app-raised-button]:!bg-white [&_.app-raised-button]:!text-zinc-600 [&_.app-raised-button]:!shadow-none [&_.app-raised-button]:hover:!border-zinc-500 [&_.app-raised-button]:hover:!text-zinc-950">
        <ShareReportActions domainLabel={host} scanId={scanId} visualEvidenceHref={visualEvidenceHref} visualEvidenceOnly />
      </div>
      <FullSiteRegion>{region}</FullSiteRegion>
      <FullSiteTiming />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium text-zinc-500">{createdAt}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <VendorBrandLogo className="!h-7 !w-7 translate-y-0.5 !rounded-md !border-zinc-200 !bg-zinc-50 !p-1 !shadow-sm" label={host} />
          <h2 className="max-w-5xl break-words text-2xl font-semibold text-zinc-950">{host}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      </div>
      <p className="mt-2 hidden break-all font-mono text-xs tabular-nums text-zinc-500 sm:block">{url}</p>
    </div>
  </header>;
}
