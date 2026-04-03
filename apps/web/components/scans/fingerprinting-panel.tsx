type FingerprintingPanelProps = {
  categories: Array<{ name: string; count: number; firstSeenMs: number | null }>;
  confidence: string | null;
  label: string;
  narrative?: string;
  reasons: string[];
};

export function FingerprintingPanel(input: FingerprintingPanelProps) {
  return (
    <div className="space-y-5 rounded-[1.55rem] border border-slate-200/80 bg-white/92 p-5 shadow-[0_16px_44px_-26px_rgba(15,23,42,0.24)]">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold tracking-tight text-slate-950">Fingerprinting</p>
        <p className="text-sm text-slate-600">{input.narrative ?? input.label}{input.confidence ? ` · ${input.confidence} confidence` : ""}</p>
      </div>
      {input.reasons.length > 0 ? (
        <div className="space-y-1.5 rounded-[1.2rem] border border-slate-200/80 bg-slate-50/70 px-4 py-3.5 text-sm text-slate-700">
          {input.reasons.slice(0, 3).map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      ) : null}
      {input.categories.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {input.categories.slice(0, 8).map((category) => (
            <span key={category.name} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
              {category.name.replaceAll("_", " ")} · {category.count}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
