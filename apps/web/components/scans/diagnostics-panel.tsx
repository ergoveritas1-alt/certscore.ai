type DiagnosticsPanelProps = {
  autoplayObserved: boolean;
  forcedActionRequired: boolean;
  interstitialDetected: boolean;
  overlayDetected: boolean;
  popupCount: number;
};

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
    </div>
  );
}
