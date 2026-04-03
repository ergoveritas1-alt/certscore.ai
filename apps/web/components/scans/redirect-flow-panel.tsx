type RedirectFlowPanelProps = {
  autoRedirect: boolean;
  crossDomainHopCount: number;
  finalUrl: string | null;
  initialUrl: string | null;
  redirectHopCount: number;
};

export function RedirectFlowPanel(input: RedirectFlowPanelProps) {
  return (
    <div className="space-y-4 rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.28)]">
      <div className="space-y-1">
        <p className="text-sm font-semibold tracking-tight text-slate-950">Redirect flow</p>
        <p className="text-sm text-slate-600">
          {input.redirectHopCount} hop{input.redirectHopCount === 1 ? "" : "s"}{input.autoRedirect ? " with automatic navigation" : ""}.
        </p>
      </div>
      <div className="space-y-2 text-sm text-slate-700">
        {input.initialUrl ? <p>Start: {input.initialUrl}</p> : null}
        {input.finalUrl ? <p>End: {input.finalUrl}</p> : null}
        <p>Cross-domain hops: {input.crossDomainHopCount}</p>
      </div>
    </div>
  );
}
