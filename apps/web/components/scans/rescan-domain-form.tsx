"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import { useActionState } from "react";
import { rescanDomainAction } from "../../server/scans/rescan-domain";
import type { CreateFullScanActionState } from "../../server/scans/create-full-scan";

const initialState: CreateFullScanActionState = {
  error: null
};

type RescanDomainFormProps = {
  cooldownMessage?: string | null;
  disabled?: boolean;
  domainId: string;
  compact?: boolean;
  showLabel?: boolean;
};

export function RescanDomainForm({ cooldownMessage = null, compact = false, disabled = false, domainId, showLabel = false }: RescanDomainFormProps) {
  const [state, action, isPending] = useActionState(rescanDomainAction, initialState);
  const errorMessage = state.error;
  const isDisabled = disabled || isPending;
  const tooltipMessage = disabled ? cooldownMessage : null;

  return (
    <form action={action} className={compact ? "space-y-0" : "space-y-2"}>
      <input name="domainId" type="hidden" value={domainId} />
      {errorMessage ? <p className="max-w-sm text-sm text-red-600">{errorMessage}</p> : null}
      <div className="group relative inline-flex">
        <Button
          aria-label={isPending ? "Queueing rescan" : "Re-scan domain"}
          className={
            showLabel
              ? compact
                ? "inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-400 hover:text-slate-950"
                : "inline-flex h-11 items-center gap-2 rounded-full border-0 bg-[linear-gradient(180deg,#62cf63_0%,#4fbe51_100%)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,190,81,0.24)] hover:brightness-[1.03]"
              : "h-11 w-11 rounded-full border-0 bg-[linear-gradient(180deg,#62cf63_0%,#4fbe51_100%)] p-0 text-white shadow-[0_10px_24px_rgba(79,190,81,0.24)] hover:brightness-[1.03]"
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
    </form>
  );
}
