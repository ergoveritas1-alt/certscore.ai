type VendorFootprintCardProps = {
  adtechHosts: string[];
  domains: string[];
  preConsentVendors: string[];
  sessionReplayVendors: string[];
  topObservedEntities: Array<{ label: string; category: string; requestCount: number }>;
  trackerSummary: string;
  unresolvedHosts: string[];
  vendorCategoryCounts: Record<string, number>;
  vendors: string[];
};

export function VendorFootprintCard(input: VendorFootprintCardProps) {
  return (
    <div className="space-y-5 rounded-[1.55rem] border border-slate-200/80 bg-white/92 p-5 shadow-[0_16px_44px_-26px_rgba(15,23,42,0.24)]">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold tracking-tight text-slate-950">Vendor footprint</p>
        <p className="text-sm text-slate-600">{input.trackerSummary}</p>
      </div>
      {Object.keys(input.vendorCategoryCounts).length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Object.entries(input.vendorCategoryCounts)
            .sort((left, right) => right[1] - left[1])
            .slice(0, 5)
            .map(([category, count]) => (
              <span key={category} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                {category.replaceAll("_", " ")}: {count}
              </span>
            ))}
        </div>
      ) : null}
      {input.sessionReplayVendors.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-fuchsia-200/80 bg-fuchsia-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">Session recording services</p>
          <div className="flex flex-wrap gap-2">
            {input.sessionReplayVendors.slice(0, 10).map((vendor) => (
              <span key={vendor} className="rounded-full border border-fuchsia-200 bg-white px-2.5 py-1 text-xs font-medium text-fuchsia-800">
                {vendor}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {input.vendors.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Resolved vendors</p>
          <div className="flex flex-wrap gap-2">
            {input.vendors.slice(0, 20).map((vendor) => (
              <span key={vendor} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                {vendor}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {input.preConsentVendors.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-rose-200/80 bg-rose-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">Observed before consent</p>
          <div className="flex flex-wrap gap-2">
            {input.preConsentVendors.slice(0, 16).map((vendor) => (
              <span key={vendor} className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700">
                {vendor}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {input.adtechHosts.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-amber-200/80 bg-amber-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">Observed adtech / analytics hosts</p>
          <div className="space-y-1.5 text-sm text-amber-950">
            {input.adtechHosts.slice(0, 10).map((host) => (
              <p key={host}>{host}</p>
            ))}
          </div>
        </div>
      ) : null}
      {input.unresolvedHosts.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-violet-200/80 bg-violet-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">Unresolved hosts for enrichment</p>
          <div className="space-y-1.5 text-sm text-violet-950">
            {input.unresolvedHosts.slice(0, 12).map((host) => (
              <p key={host}>{host}</p>
            ))}
          </div>
        </div>
      ) : null}
      {input.topObservedEntities.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Top third-party entities</p>
          <div className="space-y-2">
            {input.topObservedEntities.slice(0, 8).map((entity) => (
              <div key={entity.label} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{entity.label}</p>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{entity.category}</p>
                </div>
                <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                  {entity.requestCount} req
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {input.domains.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sample domains</p>
          <div className="space-y-1.5 text-sm text-slate-700">
            {input.domains.slice(0, 5).map((domain) => (
              <p key={domain}>{domain}</p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
