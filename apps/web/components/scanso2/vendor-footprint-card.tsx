import { VendorBrandChip } from "./vendor-brand-chip";

type VendorFootprintCardProps = {
  adtechHosts: string[];
  domains: string[];
  observedCookieCount?: number;
  observedDomainCount?: number;
  observedIpCount?: number;
  observedRequestCount?: number;
  preConsentVendors: string[];
  sessionReplayVendors: string[];
  topObservedEntities: Array<{ label: string; category: string; requestCount: number }>;
  trackerSummary: string;
  unresolvedHosts: string[];
  vendorCategoryCounts: Record<string, number>;
  vendors: string[];
};

export function VendorFootprintCard(input: VendorFootprintCardProps) {
  const summaryMetrics = [
    typeof input.observedRequestCount === "number" && input.observedRequestCount > 0
      ? { label: "Requests observed", value: input.observedRequestCount }
      : null,
    typeof input.observedCookieCount === "number" && input.observedCookieCount > 0
      ? { label: "Cookies observed", value: input.observedCookieCount }
      : null,
    typeof input.observedDomainCount === "number" && input.observedDomainCount > 0
      ? { label: "Domains observed", value: input.observedDomainCount }
      : null,
    typeof input.observedIpCount === "number" && input.observedIpCount > 0
      ? { label: "IPs observed", value: input.observedIpCount }
      : null
  ].filter((metric): metric is { label: string; value: number } => Boolean(metric));

  return (
    <div className="space-y-5 rounded-[1.55rem] border border-slate-200/80 bg-white/92 p-5 shadow-[0_16px_44px_-26px_rgba(15,23,42,0.24)]">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold tracking-tight text-slate-950">Vendor footprint</p>
        <p className="text-sm text-slate-600">{input.trackerSummary}</p>
      </div>
      {summaryMetrics.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryMetrics.map((metric) => (
            <div key={metric.label} className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{metric.label}</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{metric.value}</p>
            </div>
          ))}
        </div>
      ) : null}
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
              <VendorBrandChip key={vendor} category="session_replay" label={vendor} suffix="session replay" />
            ))}
          </div>
        </div>
      ) : null}
      {input.vendors.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-slate-200/80 bg-slate-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Resolved vendors</p>
          <div className="flex flex-wrap gap-2">
            {input.vendors.slice(0, 20).map((vendor) => (
              <VendorBrandChip key={vendor} category="vendor" label={vendor} suffix="vendor" />
            ))}
          </div>
        </div>
      ) : null}
      {input.preConsentVendors.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-rose-200/80 bg-rose-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">Observed before consent</p>
          <div className="flex flex-wrap gap-2">
            {input.preConsentVendors.slice(0, 16).map((vendor) => (
              <VendorBrandChip key={vendor} category="pre_consent" label={vendor} suffix="pre-consent" />
            ))}
          </div>
        </div>
      ) : null}
      {input.adtechHosts.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-amber-200/80 bg-amber-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">Observed adtech / analytics hosts</p>
          <div className="flex flex-wrap gap-2">
            {input.adtechHosts.slice(0, 10).map((host) => (
              <VendorBrandChip key={host} category="host" label={host} suffix="host" />
            ))}
          </div>
        </div>
      ) : null}
      {input.unresolvedHosts.length > 0 ? (
        <div className="space-y-2 rounded-[1.2rem] border border-violet-200/80 bg-violet-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">Unresolved hosts for enrichment</p>
          <div className="flex flex-wrap gap-2">
            {input.unresolvedHosts.slice(0, 12).map((host) => (
              <VendorBrandChip key={host} category="host" label={host} suffix="host" />
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
                  <VendorBrandChip category={entity.category} label={entity.label} requestCount={entity.requestCount} />
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
          <div className="flex flex-wrap gap-2">
            {input.domains.slice(0, 5).map((domain) => (
              <VendorBrandChip key={domain} category="domain" label={domain} suffix="domain" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
