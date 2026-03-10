"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import { useActionState } from "react";
import { createFullScanAction, type CreateFullScanActionState } from "../../server/scans/create-full-scan";

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

  return (
    <form action={action} className="space-y-3">
      <input name="domainId" type="hidden" value={domainId} />
      {errorMessage ? <p className="max-w-sm text-sm text-red-600">{errorMessage}</p> : null}
      <Button disabled={isDisabled} type="submit">
        {isPending ? "Queueing scan..." : disabled ? "Queue unavailable" : "Queue full scan"}
      </Button>
    </form>
  );
}
