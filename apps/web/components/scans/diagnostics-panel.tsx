import type { ScanEvidenceTriageRow, ScanEvidenceTriageSummary } from "../../lib/scans/scan-evidence-triage";

type DiagnosticsPanelProps = {
  autoplayObserved: boolean;
  evidenceTriage?: ScanEvidenceTriageSummary | null;
  forcedActionRequired: boolean;
  interstitialDetected: boolean;
  overlayDetected: boolean;
  popupCount: number;
};

function toneClassName(tone: ScanEvidenceTriageRow["tone"] | undefined) {
  switch (tone) {
    case "good":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "muted":
      return "border-slate-200 bg-slate-50 text-slate-500";
    default:
      return "border-slate-200 bg-white text-slate-800";
  }
}

function TriageRows({ rows }: { rows: ScanEvidenceTriageRow[] }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className={`rounded-xl border px-3 py-2 ${toneClassName(row.tone)}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">{row.label}</div>
          <div className="mt-1 break-words text-sm font-medium">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function TriageList({ emptyLabel, items }: { emptyLabel: string; items: string[] }) {
  return items.length > 0 ? (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
          {item}
        </span>
      ))}
    </div>
  ) : (
    <p className="text-sm text-slate-500">{emptyLabel}</p>
  );
}

function EvidenceTriageBlock({ triage }: { triage: ScanEvidenceTriageSummary }) {
  if (!triage.hasAnySignal) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        No retained policy/control/timing triage summary is available for this scan.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Policy surface triage</p>
          <p className="text-xs leading-5 text-slate-500">Retained policy discovery state and GDPR Transparency evidence readiness.</p>
        </div>
        <TriageRows rows={triage.policy.rows} />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Not testable rows</p>
            <TriageList emptyLabel="No Not Testable rows in the retained checklist." items={triage.policy.notTestableRows} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Failure classes</p>
            {triage.policy.failureClasses.length > 0 ? <TriageRows rows={triage.policy.failureClasses} /> : <TriageList emptyLabel="No policy failure classes retained." items={[]} />}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selected policy URLs</p>
            <TriageList emptyLabel="No canonical policy URL retained." items={triage.policy.selectedUrls} />
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Consent control triage</p>
          <p className="text-xs leading-5 text-slate-500">Retained first-layer control inventory and rejection reasons from the scanner evidence path.</p>
        </div>
        <TriageRows rows={triage.consent.rows} />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Candidate labels</p>
            <TriageList emptyLabel="No bounded candidate labels retained." items={triage.consent.candidateLabels} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rejection reasons</p>
            <TriageList emptyLabel="No inventory rejection reasons retained." items={triage.consent.rejectionReasons} />
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Timing triage</p>
          <p className="text-xs leading-5 text-slate-500">Bounded scanner timing summary for slow-scan diagnosis.</p>
        </div>
        <TriageRows rows={triage.timing.rows} />
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Slowest retained buckets</p>
          {triage.timing.slowestBuckets.length > 0 ? <TriageRows rows={triage.timing.slowestBuckets} /> : <TriageList emptyLabel="No slow timing buckets retained." items={[]} />}
        </div>
      </div>
    </div>
  );
}

export function DiagnosticsPanel(input: DiagnosticsPanelProps) {
  const rows = [
    { label: "Overlay detected", value: input.overlayDetected ? "Yes" : "No" },
    { label: "Forced action required", value: input.forcedActionRequired ? "Yes" : "No" },
    { label: "Interstitial detected", value: input.interstitialDetected ? "Yes" : "No" },
    { label: "Popup count", value: String(input.popupCount) },
    { label: "Autoplay observed", value: input.autoplayObserved ? "Yes" : "No" }
  ];

  return (
    <div className="space-y-4 rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.28)]">
      <div className="space-y-1">
        <p className="text-sm font-semibold tracking-tight text-slate-950">Runtime diagnostics</p>
        <p className="text-sm text-slate-600">Supporting runtime behaviors captured during the page run.</p>
      </div>
      <div className="space-y-2 text-sm text-slate-700">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
            <span>{row.label}</span>
            <span className="font-medium text-slate-950">{row.value}</span>
          </div>
        ))}
      </div>
      {input.evidenceTriage ? <EvidenceTriageBlock triage={input.evidenceTriage} /> : null}
    </div>
  );
}
