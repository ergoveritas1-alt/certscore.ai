"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useActionState, useEffect, useState } from "react";
import { clearPendingScanStarted, markPendingScanStarted } from "../analytics/data-layer-events";
import { createDomainAction, type CreateDomainActionState } from "../../server/domains/create-domain";
import { ScanFromSelect, type ScanFrom } from "../scans/scan-from-select";
import {
  ScanSubmitProgressBar,
  normalizeLocalV2ScanProfile,
  useScanProgressClock,
  type LocalV2ScanProfile
} from "../scans/scan-submit-progress";

const initialState: CreateDomainActionState = {
  error: null
};

type AddDomainFormProps = {
  planCode: string;
};

export function AddDomainForm({ planCode }: AddDomainFormProps) {
  const [state, action, isPending] = useActionState(createDomainAction, initialState);
  const [freshRescan, setFreshRescan] = useState(false);
  const [localV2ScanProfile, setLocalV2ScanProfile] = useState<LocalV2ScanProfile>("full");
  const [scanFrom, setScanFrom] = useState<ScanFrom>("default");
  const scanProgress = useScanProgressClock(isPending);

  useEffect(() => {
    if (state.error) {
      clearPendingScanStarted();
    }
  }, [state.error]);

  return (
    <form action={action} className="space-y-4" onSubmit={() => markPendingScanStarted("dashboard")}>
      <div>
        <div className="relative">
          <Input
            autoComplete="url"
            className="h-14 rounded-[1.75rem] border-slate-300 pr-52 text-xl shadow-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-slate-200"
            defaultValue=""
            id="domain"
            name="domain"
            placeholder="example.com, yoursite.com"
            required
            type="text"
          />
          <div className="absolute right-[10.6rem] top-1/2 -translate-y-1/2">
            <ScanFromSelect
              freshRescanValue={freshRescan}
              includeFreshRescanOption
              includeLocalV2ScanProfileOption
              localV2ScanProfileValue={localV2ScanProfile}
              onChange={setScanFrom}
              onFreshRescanChange={setFreshRescan}
              onLocalV2ScanProfileChange={(value) => setLocalV2ScanProfile(normalizeLocalV2ScanProfile(value))}
              value={scanFrom}
              variant="icon"
            />
          </div>
          <Button
            aria-label="Start scanning"
            className="absolute right-2.5 top-1/2 h-10 -translate-y-1/2 rounded-full border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] px-4 text-sm font-medium text-white shadow-[0_10px_24px_rgba(15,139,215,0.16)] hover:brightness-[1.04]"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Starting..." : "Start scanning"}
          </Button>
        </div>
      </div>

      {planCode === "free" ? (
        <p className="text-xs text-slate-500">
          Trial accounts include a limited page-scan allowance for evaluating the workflow.
        </p>
      ) : null}

      {isPending ? (
        <ScanSubmitProgressBar
          active
          nowMs={scanProgress.nowMs}
          profileValue={localV2ScanProfile}
          startedAtMs={scanProgress.startedAtMs}
        />
      ) : null}

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
