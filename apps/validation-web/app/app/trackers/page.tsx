import Link from "next/link";
import { getDashboardContext } from "../../../server/auth";
import { getOrganizationTrackerInventory } from "../../../server/trackers/get-organization-tracker-inventory";
import {
  formatCollectionEndpointType,
  formatTrackerRiskLabel,
  formatTrackerSeverityLabel,
  getTrackerRiskLabels,
  getTrackerSeverity
} from "../../../lib/scans/tracker-risk";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(2);
}

export default async function TrackersPage() {
  const { organization } = await getDashboardContext();
  const inventory = await getOrganizationTrackerInventory(organization.id);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Tracker intelligence</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Cross-domain tracker inventory</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Latest observed trackers across your domains, with vendor prevalence, risk labels, and first-party collection endpoint signals.
          </p>
        </div>
        <Link className="text-sm font-medium text-slate-900 underline underline-offset-4" href="/app">
          Back to overview
        </Link>
      </div>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-950">Pre-consent tracker leaderboard</h2>
          <p className="text-sm text-slate-600">
            Vendors observed before consent on the latest completed scan for each domain, ranked by repeat exposure across your workspace.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {inventory.preconsentLeaderboard.map((vendor) => (
            <div key={`${vendor.vendorName}-${vendor.vendorCategory}-preconsent`} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{vendor.vendorName}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{vendor.vendorCategory}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Seen {vendor.domainCount} domains</p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-700">
                    {formatTrackerSeverityLabel(
                      getTrackerSeverity({
                        vendorCategory: vendor.vendorCategory,
                        vendorName: vendor.vendorName,
                        collectionEndpointType: null
                      }).label
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {getTrackerRiskLabels({
                  vendorCategory: vendor.vendorCategory,
                  vendorName: vendor.vendorName,
                  collectionEndpointType: null
                }).map((label) => (
                  <span
                    key={`${vendor.vendorName}-${label}-preconsent`}
                    className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-700"
                  >
                    {formatTrackerRiskLabel(label)}
                  </span>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                <p>Violations: {vendor.totalViolationCount}</p>
                <p>Last seen: {formatDateTime(vendor.latestSeenAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-950">Vendor leaderboard</h2>
          <p className="text-sm text-slate-600">Aggregated across the latest completed scan for each domain in this workspace.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {inventory.leaderboard.map((vendor) => (
            <div key={`${vendor.vendorName}-${vendor.vendorCategory}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{vendor.vendorName}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{vendor.vendorCategory}</p>
                </div>
                <p className="text-xs text-slate-500">Seen {vendor.domainCount} domains</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {getTrackerRiskLabels({
                  vendorCategory: vendor.vendorCategory,
                  vendorName: vendor.vendorName,
                  collectionEndpointType: vendor.collectionProxyCount > 0 ? "first_party_collection_proxy" : null
                }).map((label) => (
                  <span
                    key={`${vendor.vendorName}-${label}`}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-700"
                  >
                    {formatTrackerRiskLabel(label)}
                  </span>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                <p>Before consent: {vendor.beforeConsentCount}</p>
                <p>1P endpoints: {vendor.firstPartyCount}</p>
                <p>1P proxies: {vendor.collectionProxyCount}</p>
                <p>Last seen: {formatDateTime(vendor.latestSeenAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-950">Latest per-domain inventory</h2>
          <p className="text-sm text-slate-600">Use this to compare how the current tracker stack differs across domains.</p>
        </div>
        <div className="space-y-4">
          {inventory.latestPerDomain.map((domain) => (
            <div key={domain.scanId} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <p className="text-base font-semibold text-slate-950">{domain.domainHostname}</p>
                  <p className="text-sm text-slate-500">Latest scan {formatDateTime(domain.completedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {domain.preconsentViolationCount > 0 ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-700">
                      {domain.preconsentViolationCount} pre-consent violation{domain.preconsentViolationCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  <Link className="text-sm font-medium text-slate-900 underline underline-offset-4" href={`/app/scans/${domain.scanId}`}>
                    Open scan
                  </Link>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {domain.trackers.map((tracker) => (
                  <div
                    key={`${domain.scanId}-${tracker.vendorName}-${tracker.scriptHost ?? "none"}-${tracker.vendorCategory}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <p className="text-sm font-medium text-slate-950">{tracker.vendorName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                      {tracker.vendorCategory} · {tracker.firstPartyOrThirdParty}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {getTrackerRiskLabels(tracker).map((label) => (
                        <span
                          key={`${domain.scanId}-${tracker.vendorName}-${label}`}
                          className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-700"
                        >
                          {formatTrackerRiskLabel(label)}
                        </span>
                      ))}
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-700">
                        {formatTrackerSeverityLabel(
                          getTrackerSeverity({
                            vendorCategory: tracker.vendorCategory,
                            vendorName: tracker.vendorName,
                            collectionEndpointType: tracker.collectionEndpointType
                          }).label
                        )}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Before consent {tracker.beforeConsent ? "Yes" : tracker.beforeConsent === false ? "No" : "Unknown"} · Confidence{" "}
                      {formatConfidence(tracker.confidence)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">Host {tracker.scriptHost ?? "n/a"}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Endpoint {formatCollectionEndpointType(tracker.collectionEndpointType)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
