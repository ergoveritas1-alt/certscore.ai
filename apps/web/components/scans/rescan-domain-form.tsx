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
};

export function RescanDomainForm({ cooldownMessage = null, disabled = false, domainId }: RescanDomainFormProps) {
  const [state, action, isPending] = useActionState(rescanDomainAction, initialState);
  const errorMessage = state.error;
  const isDisabled = disabled || isPending;
  const tooltipMessage = disabled ? cooldownMessage : null;

  return (
    <form action={action} className="space-y-2">
      <input name="domainId" type="hidden" value={domainId} />
      {errorMessage ? <p className="max-w-sm text-sm text-red-600">{errorMessage}</p> : null}
      <div className="group relative inline-flex">
        <Button disabled={isDisabled} size="sm" type="submit" variant="secondary">
          {isPending ? "Queueing..." : "Re-scan"}
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
