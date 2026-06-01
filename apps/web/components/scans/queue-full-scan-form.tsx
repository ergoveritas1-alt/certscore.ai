"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import { useActionState, useEffect } from "react";
import { clearPendingScanStarted, markPendingScanStarted } from "../analytics/data-layer-events";
import { createFullScanAction, type CreateFullScanActionState } from "../../server/scans/create-full-scan";
import { ScanFromSelect } from "./scan-from-select";

const initialState: CreateFullScanActionState = {
  error: null
};

type QueueFullScanFormProps = {
  domainId: string;
  disabled?: boolean;
  unavailableReason?: string | null;
};

export function QueueFullScanForm({ domainId, disabled = false, unavailableReason = null }: QueueFullScanFormProps) {
  const [state, action, isPending] = useActionState(createFullScanAction, initialState);
  const isDisabled = disabled || isPending;
  const errorMessage = state.error ?? unavailableReason;

  useEffect(() => {
    if (state.error) {
      clearPendingScanStarted();
    }
  }, [state.error]);

  return (
    <form action={action} className="space-y-3" onSubmit={() => markPendingScanStarted("dashboard")}>
      <input name="domainId" type="hidden" value={domainId} />
      <ScanFromSelect includeFreshRescanOption />
      {errorMessage ? <p className="max-w-sm text-sm text-red-600">{errorMessage}</p> : null}
      <Button
        className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
        disabled={isDisabled}
        type="submit"
      >
        {isPending ? "Queueing scan..." : disabled ? "Queue unavailable" : "Queue full scan"}
      </Button>
    </form>
  );
}
