"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import { useActionState, useEffect, useState } from "react";
import { clearPendingScanStarted, markPendingScanStarted } from "../analytics/data-layer-events";
import { createFullScanAction, type CreateFullScanActionState } from "../../server/scans/create-full-scan";
import { ScanFromSelect } from "./scan-from-select";
import {
  ScanSubmitProgressBar,
  normalizeLocalV2ScanProfile,
  useScanProgressClock,
  type LocalV2ScanProfile
} from "./scan-submit-progress";

const initialState: CreateFullScanActionState = {
  error: null
};

type QueueFullScanFormProps = {
  allowRestrictedScanOptions?: boolean;
  domainId: string;
  disabled?: boolean;
  unavailableReason?: string | null;
};

export function QueueFullScanForm({
  allowRestrictedScanOptions = false,
  domainId,
  disabled = false,
  unavailableReason = null
}: QueueFullScanFormProps) {
  const [state, action, isPending] = useActionState(createFullScanAction, initialState);
  const [localV2ScanProfile, setLocalV2ScanProfile] = useState<LocalV2ScanProfile>("standard");
  const [localV2RunViaLambda, setLocalV2RunViaLambda] = useState(true);
  const scanProgress = useScanProgressClock(isPending);
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
      <ScanFromSelect
        allowRestrictedScanOptions={allowRestrictedScanOptions}
        includeFreshRescanOption
        includeLocalV2ScanProfileOption
        localV2ScanProfileValue={localV2ScanProfile}
        localV2RunViaLambdaValue={localV2RunViaLambda}
        onLocalV2ScanProfileChange={(value) => setLocalV2ScanProfile(normalizeLocalV2ScanProfile(value))}
        onLocalV2RunViaLambdaChange={setLocalV2RunViaLambda}
      />
      {errorMessage ? <p className="max-w-sm text-sm text-red-600">{errorMessage}</p> : null}
      {isPending ? (
        <ScanSubmitProgressBar
          active
          nowMs={scanProgress.nowMs}
          profileValue={localV2ScanProfile}
          startedAtMs={scanProgress.startedAtMs}
        />
      ) : null}
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
