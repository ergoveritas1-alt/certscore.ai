"use client";

import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { LocalV2DagScanProgressCard, type LocalV2ScanProfile } from "./scan-submit-progress";

type ScanReportRescanTransitionState = {
  profile: LocalV2ScanProfile;
  startedAtMs: number;
  targetLabel: string;
};

type ScanReportRescanTransitionContextValue = {
  begin: (state: ScanReportRescanTransitionState) => void;
  cancel: () => void;
};

const ScanReportRescanTransitionContext = createContext<ScanReportRescanTransitionContextValue | null>(null);

export function useScanReportRescanTransition() {
  return useContext(ScanReportRescanTransitionContext);
}

export function ScanReportSubmissionProgressView({
  profile,
  startedAtMs,
  targetLabel
}: ScanReportRescanTransitionState) {
  const startedAt = new Date(startedAtMs).toISOString();

  return (
    <div className="space-y-8" aria-busy="true">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">CertScore.ai scan</p>
        <h1 className="mt-2 flex min-w-0 max-w-full items-baseline gap-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          <span className="shrink-0">Scan:</span>
          <span className="min-w-0 truncate" title={targetLabel}>{targetLabel}</span>
        </h1>
      </div>
      <LocalV2DagScanProgressCard
        createdAt={startedAt}
        profileValue={profile}
        progressStage="scan"
        startedAt={startedAt}
        targetLabel={targetLabel}
      />
    </div>
  );
}

export function ScanReportRescanTransition({ children }: { children: ReactNode }) {
  const [transitionState, setTransitionState] = useState<ScanReportRescanTransitionState | null>(null);
  const begin = useCallback((state: ScanReportRescanTransitionState) => {
    setTransitionState(state);
  }, []);
  const cancel = useCallback(() => {
    setTransitionState(null);
  }, []);
  const contextValue = useMemo(() => ({ begin, cancel }), [begin, cancel]);

  return (
    <ScanReportRescanTransitionContext.Provider value={contextValue}>
      <div aria-hidden={transitionState ? true : undefined} className={transitionState ? "hidden" : undefined}>
        {children}
      </div>
      {transitionState ? <ScanReportSubmissionProgressView {...transitionState} /> : null}
    </ScanReportRescanTransitionContext.Provider>
  );
}
