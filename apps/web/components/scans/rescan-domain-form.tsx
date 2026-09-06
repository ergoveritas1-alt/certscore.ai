"use client";

import { FullSiteControls } from "./full-site-controls";

import { Button } from "@website-signal-risk-scanner/ui";
import { useActionState, useState } from "react";
import { rescanDomainAction } from "../../server/scans/rescan-domain";
import type { CreateFullScanActionState } from "../../server/scans/create-full-scan";
import { ScanFromSelect, type ServerScanFrom } from "./scan-from-select";
import {
  ScanSubmissionPendingIndicator,
  normalizeLocalV2ScanProfile,
  type LocalV2ScanProfile
} from "./scan-submit-progress";

const initialState: CreateFullScanActionState = {
  error: null
};

type RescanDomainFormProps = {
  allowRestrictedScanOptions?: boolean;
  cooldownMessage?: string | null;
  disabled?: boolean;
  domainId: string;
  defaultScanFrom?: ServerScanFrom;
  compact?: boolean;
  showLabel?: boolean;
};

export function RescanDomainForm({ allowRestrictedScanOptions = false, cooldownMessage = null, compact = false, defaultScanFrom = "eu_ie", disabled = false, domainId, showLabel = false }: RescanDomainFormProps) {
  const [state, action, isPending] = useActionState(rescanDomainAction, initialState);
  const [localV2ScanProfile, setLocalV2ScanProfile] = useState<LocalV2ScanProfile>("standard");
  const errorMessage = state.error;
  const isDisabled = disabled || isPending;
  const tooltipMessage = disabled ? cooldownMessage : null;

  return (
    <form action={action} className={compact ? "space-y-0" : "space-y-2"}>
      <FullSiteControls />
      <input name="domainId" type="hidden" value={domainId} />
      {errorMessage ? <p className="max-w-sm text-sm text-red-600">{errorMessage}</p> : null}
      <div className="group relative inline-flex items-center gap-1.5">
        <ScanFromSelect
          allowRestrictedScanOptions={allowRestrictedScanOptions}
          compact
          includeLocalV2ScanProfileOption
          includeScanFromOptions={false}
          localV2ScanProfileValue={localV2ScanProfile}
          onLocalV2ScanProfileChange={(value) => setLocalV2ScanProfile(normalizeLocalV2ScanProfile(value))}
          value={defaultScanFrom}
          variant="icon"
        />
        <Button
          aria-label={isPending ? "Queueing rescan" : "Re-scan domain"}
          className={
            showLabel
              ? compact
                ? "scan-report-button scan-report-button-primary inline-flex h-8 items-center gap-1.5 rounded-full border-0 bg-[linear-gradient(180deg,#38bdf8_0%,#0284c7_100%)] px-3 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(14,165,233,0.22)] hover:brightness-[1.03]"
                : "scan-report-button inline-flex h-11 items-center gap-2 rounded-full border border-sky-300 bg-[linear-gradient(180deg,#38bdf8_0%,#0284c7_100%)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(14,165,233,0.28)] hover:brightness-[1.03]"
              : "scan-report-button h-11 w-11 rounded-full border border-sky-300 bg-[linear-gradient(180deg,#38bdf8_0%,#0284c7_100%)] p-0 text-white shadow-[0_10px_24px_rgba(14,165,233,0.28)] hover:brightness-[1.03]"
          }
          disabled={isDisabled}
          size="sm"
          type="submit"
          variant="secondary"
        >
          {isPending ? (
            <span className="text-[10px] font-medium">...</span>
          ) : (
            <>
              <svg
                viewBox="0 0 24 24"
                className={showLabel && compact ? "h-3.5 w-3.5" : "h-5 w-5"}
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth={showLabel && compact ? "2.2" : "2.4"}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
              {showLabel ? <span>Re-scan</span> : null}
            </>
          )}
        </Button>
        {tooltipMessage ? (
          <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg group-hover:block">
            {tooltipMessage}
          </div>
        ) : null}
      </div>
      {isPending ? (
        <ScanSubmissionPendingIndicator compact={compact} />
      ) : null}
    </form>
  );
}
