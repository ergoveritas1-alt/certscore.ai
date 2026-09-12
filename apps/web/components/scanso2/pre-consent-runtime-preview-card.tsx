import type { ApiV2PreConsentRuntimePreview } from "@certscore/api-contracts";
import React from "react";
import {
  RuntimeInventorySummaryCard,
  RuntimeObservationTimeline,
  type RuntimeInventoryMixRow,
  type RuntimeObservationTimelineEvent,
} from "./runtime-observation-sections";
import { VendorBrandChip } from "./vendor-brand-chip";
import { resolveCanonicalServicePurpose } from "@certscore/vendor-resolver";

type PreviewCookie = ApiV2PreConsentRuntimePreview["cookies"][number];
type PreviewTracker = ApiV2PreConsentRuntimePreview["trackers"][number];

const PREVIEW_INVENTORY_VISIBLE_ROW_LIMIT = 6;

type PreviewInventoryRow = RuntimeInventoryMixRow & {
  confidence: string;
  domains: string;
  item: string;
  observed: string;
  vendor?: string;
  requestCount?: number;
  type: "Cookie / storage" | "Tracker / request" | "Embed";
};

function displayLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatElapsedTime(milliseconds: number | null) {
  if (milliseconds === null) return "Timing unavailable";
  if (milliseconds < 1_000) return `${milliseconds}ms`;
  const seconds = Math.round(milliseconds / 10) / 100;
  return `${seconds}s`;
}

function cookieEvidence(cookie: PreviewCookie) {
  if (cookie.essentiality === "non_essential") return "Non-essential";
  if (cookie.essentiality === "essential") return "Essential";
  return "Review";
}

function cookieRelationship(cookie: PreviewCookie) {
  if (cookie.party === "first_party") return "Same-site";
  if (cookie.party === "third_party") return "Cross-site";
  return "Unknown";
}

function trackerConfidence(tracker: Pick<PreviewTracker, "confidence">) {
  if (tracker.confidence >= 0.85) return "High";
  if (tracker.confidence >= 0.6) return "Medium";
  return "Low";
}

export function previewInventory(preview: ApiV2PreConsentRuntimePreview): PreviewInventoryRow[] {
  const cookies = preview.cookies.map((cookie) => ({
    confidence: "Not retained",
    domains: cookie.domain ?? "Domain unavailable",
    evidence: cookieEvidence(cookie),
    item: cookie.name,
    observed: formatElapsedTime(cookie.observedAtMs),
    purpose: displayLabel(cookie.purpose),
    recordCount: 1,
    relationship: cookieRelationship(cookie),
    type: "Cookie / storage" as const,
  }));
  const trackers = preview.trackers.map((tracker) => ({
    confidence: trackerConfidence(tracker),
    domains: tracker.domains.join(", ") || "Domain unavailable",
    evidence: "Review",
    item: tracker.product ?? tracker.vendor,
    observed: "Timing unavailable",
    purpose: resolveCanonicalServicePurpose(tracker),
    recordCount: 1,
    relationship: "Unknown",
    type: "Tracker / request" as const,
  }));
  const operational = (preview.operationalVendors ?? []).map((vendor) => ({
    confidence: trackerConfidence(vendor), domains: vendor.domains.join(", ") || "Domain unavailable",
    evidence: "Contextual", item: vendor.product ?? vendor.vendor, vendor: vendor.vendor,
    observed: "Timing unavailable", purpose: resolveCanonicalServicePurpose(vendor), recordCount: 1,
    relationship: "Unknown", type: "Tracker / request" as const,
  }));
  const resources = preview.resources?.map((resource) => ({
    confidence: resource.confidence === null ? "Not retained" : trackerConfidence({ confidence: resource.confidence }),
    domains: resource.domains.join(", ") || "Domain unavailable",
    // Checkpoint identity is context, not a final necessity or risk finding.
    evidence: "Contextual", item: resource.product ?? resource.vendor ?? resource.domains[0] ?? "Unidentified resource",
    vendor: resource.vendor ?? undefined, observed: formatElapsedTime(resource.observedAtMs),
    purpose: resource.purpose, recordCount: 1, requestCount: resource.requestCount,
    relationship: resource.party === "first_party" ? "Same-site" : resource.party === "third_party" ? "Cross-site" : resource.party === "mixed" ? "Mixed" : "Unknown",
    type: resource.kind === "embed" ? "Embed" as const : "Tracker / request" as const,
  }));
  // Legacy packets still show every retained vendor. New resource rows replace
  // matching vendor summaries without double counting them in the charts.
  const vendors = [...trackers, ...operational].filter(vendor => !resources?.some(resource => resource.item === vendor.item));
  return [...cookies, ...(resources ?? []), ...vendors];
}

function checkpointElapsedMs(preview: ApiV2PreConsentRuntimePreview, startedAt: string | null) {
  if (startedAt) {
    const startedAtMs = Date.parse(startedAt);
    const generatedAtMs = Date.parse(preview.generatedAt);
    if (Number.isFinite(startedAtMs) && Number.isFinite(generatedAtMs) && generatedAtMs >= startedAtMs) {
      return generatedAtMs - startedAtMs;
    }
  }
  return preview.cookies.reduce((latest, cookie) => Math.max(latest, cookie.observedAtMs ?? 0), 0);
}

function previewTimeline(
  preview: ApiV2PreConsentRuntimePreview,
  startedAt: string | null,
): RuntimeObservationTimelineEvent[] {
  const firstCookie = [...preview.cookies]
    .filter((cookie) => cookie.observedAtMs !== null)
    .sort((left, right) => (left.observedAtMs ?? 0) - (right.observedAtMs ?? 0))[0];
  const checkpointMs = Math.max(
    checkpointElapsedMs(preview, startedAt),
    firstCookie?.observedAtMs ?? 0,
  );
  const events: RuntimeObservationTimelineEvent[] = [{
    at: "0s",
    atMs: 0,
    detail: "Public page observation began",
    label: "Scan start",
    tone: "neutral",
  }];

  if (firstCookie?.observedAtMs !== null && firstCookie?.observedAtMs !== undefined) {
    events.push({
      at: formatElapsedTime(firstCookie.observedAtMs),
      atMs: firstCookie.observedAtMs,
      detail: `${firstCookie.name} first captured before consent interaction`,
      label: "Cookie / storage",
      tone: "neutral",
    });
  }

  for (const kind of ["request", "embed"] as const) {
    const first = preview.resources?.filter(resource => resource.kind === kind)
      .sort((left, right) => left.observedAtMs - right.observedAtMs)[0];
    if (!first) continue;
    events.push({ at: formatElapsedTime(first.observedAtMs), atMs: first.observedAtMs,
      label: kind === "embed" ? "Embedded content" : "Resource request",
      detail: first.product ?? first.vendor ?? first.domains[0] ?? "Unidentified resource", tone: "neutral" });
  }

  events.push({
    at: checkpointMs > 0 ? formatElapsedTime(checkpointMs) : "Checkpoint",
    atMs: checkpointMs,
    detail: "Preliminary runtime evidence retained; scan and review continue",
    label: "Early checkpoint",
    tone: "neutral",
  });
  return events.sort((left, right) => left.atMs - right.atMs);
}

function evidenceClasses(evidence: string) {
  if (evidence === "Contextual") return "bg-sky-100 text-sky-800";
  if (evidence === "Non-essential") return "bg-rose-100 text-rose-800";
  if (evidence === "Essential") return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-800";
}

function purposeClasses(purpose: string) {
  const normalized = purpose.toLowerCase();
  if (/advert|marketing|retarget/.test(normalized)) return "bg-rose-100 text-rose-800";
  if (/analytic|audience|measurement|experiment/.test(normalized)) return "bg-amber-100 text-amber-800";
  if (/auth|security|fraud|functional/.test(normalized)) return "bg-emerald-100 text-emerald-800";
  if (/consent|privacy|compliance/.test(normalized)) return "bg-sky-100 text-sky-800";
  if (/embed|media|social/.test(normalized)) return "bg-violet-100 text-violet-800";
  if (/cdn|static|font|delivery|infrastructure/.test(normalized)) return "bg-blue-100 text-blue-800";
  return "bg-zinc-100 text-zinc-700";
}

function PreviewTypeIcon({ type }: { type: PreviewInventoryRow["type"] }) {
  const isCookie = type === "Cookie / storage";
  return (
    <span
      aria-label={type}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${
        isCookie ? "border-sky-200 bg-sky-50 text-sky-700" : "border-violet-200 bg-violet-50 text-violet-700"
      }`}
      title={type}
    >
      {isCookie ? (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path d="M20 13.2A8 8 0 1 1 10.8 4a3.1 3.1 0 0 0 3 4 3.2 3.2 0 0 0 4.1 4.1c.6.2 1.2.5 2.1 1.1Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <path d="M8.5 9.5h.01M7.5 15h.01M12.5 14h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path d="M17.6 7.3A7 7 0 0 0 5.3 10M15.2 7.4h2.7V4.7M6.4 16.7A7 7 0 0 0 18.7 14M8.8 16.6H6.1v2.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
}

function ConfidenceDots({ confidence }: { confidence: string }) {
  const level = confidence === "High" ? 3 : confidence === "Medium" ? 2 : confidence === "Low" ? 1 : 0;
  return (
    <span aria-label={`Confidence: ${confidence}`} className="inline-flex items-center gap-1" title={`Confidence: ${confidence}`}>
      {[1, 2, 3].map((dot) => (
        <span
          className={`h-2.5 w-2.5 rounded-full border border-slate-300 ${dot <= level ? "bg-slate-500" : "bg-white"}`}
          key={dot}
        />
      ))}
    </span>
  );
}

function returnedIdentityNote(preview: ApiV2PreConsentRuntimePreview) {
  if (preview.resources) return `Mixes and rows include retained request, embed, cookie, and service identities from this checkpoint. ${preview.truncated.resources ? "Resource identities are capped; captured totals may be higher. " : ""}Contextual resource rows are observations, not final evidence classifications.`;
  const returnedCookies = preview.summary.returnedCookieCount ?? preview.cookies.length;
  const returnedTrackers = preview.summary.returnedTrackingVendorCount ?? preview.trackers.length;
  const capturedTrackingVendors = preview.summary.trackingVendorCount ?? preview.summary.trackerCount;
  const truncated = preview.truncated.cookies || preview.truncated.trackers;
  if (truncated || returnedCookies < preview.summary.cookieCount || returnedTrackers < capturedTrackingVendors) {
    return `Mixes and rows describe ${returnedCookies} returned cookie identities and ${returnedTrackers} returned tracking vendors from this bounded checkpoint. Captured totals may be higher.`;
  }
  return "Mixes and rows describe the returned preview identities from this checkpoint.";
}

export function PreConsentRuntimePreviewCard({
  preview,
  startedAt,
  heading = "What happened by the runtime checkpoint",
}: {
  preview: ApiV2PreConsentRuntimePreview;
  startedAt: string | null;
  heading?: string;
}) {
  const inventory = previewInventory(preview);
  const trackingVendorCount = preview.summary.trackingVendorCount ?? preview.summary.trackerCount;
  const checkpointMs = checkpointElapsedMs(preview, startedAt);

  return (
    <section aria-label="Preliminary runtime observations" aria-live="polite" className="border-y border-zinc-200 bg-[#f7faf9]">
      <div className="px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-sky-700">Early observed sequence</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">{heading}</h2>
          </div>
          <p className="font-mono text-xs text-zinc-500">0s → {checkpointMs > 0 ? formatElapsedTime(checkpointMs) : "checkpoint"}</p>
        </div>
        <div className="mt-3">
          <RuntimeObservationTimeline dominant events={previewTimeline(preview, startedAt)} />
        </div>

        <RuntimeInventorySummaryCard
          compact
          eyebrow="Preliminary resource inventory"
          heading="What we’ve observed so far"
          inventory={inventory}
          note={`${returnedIdentityNote(preview)} Checkpoint observations are not findings or final totals; the scan is still reviewing consent controls, policies, transport, retained evidence, and report results.`}
          summary={`${preview.summary.cookieCount} cookies · ${trackingVendorCount} tracking vendors · ${preview.summary.operationalVendorCount ?? preview.operationalVendors?.length ?? 0} operational services · ${preview.summary.thirdPartyRequestCount} 3P requests`}
        >
          {inventory.length > 0 ? (
            <div
              aria-label="Preliminary resource details"
              className={`overflow-x-auto border border-zinc-200 bg-white ${
                inventory.length > PREVIEW_INVENTORY_VISIBLE_ROW_LIMIT
                  ? "max-h-[22rem] overflow-y-auto"
                  : ""
              }`}
              data-scrollable={inventory.length > PREVIEW_INVENTORY_VISIBLE_ROW_LIMIT ? "true" : "false"}
            >
              <table className="w-full min-w-[62rem] table-fixed border-collapse text-left text-xs">
                <thead className="sticky top-0 z-20 bg-zinc-50 text-zinc-500 shadow-[0_2px_8px_-6px_rgba(24,24,27,0.55)]">
                  <tr>
                    {[
                      ["Vendor / resource", "w-[14rem]"],
                      ["Type", "w-[5rem]"],
                      ["Purpose", "w-[10rem]"],
                      ["Evidence mix", "w-[9rem]"],
                      ["First seen", "w-[8rem]"],
                      ["Domains", "w-[16rem]"],
                      ["Relationship", "w-[9rem]"],
                      ["Confidence", "w-[7rem]"],
                      ["Requests", "w-[5rem]"],
                    ].map(([label, width]) => (
                      <th className={`border-b border-zinc-200 px-3 py-2.5 font-medium ${width}`} key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((row, index) => (
                    <tr className="h-[3.25rem] border-b border-zinc-100 align-top last:border-0" key={`${row.item}:${row.domains}:${index}`}>
                      <td className="px-3 py-3"><VendorBrandChip label={row.vendor ?? row.item} showMeta={false} />{row.vendor && row.vendor !== row.item ? <span className="mt-1 block text-zinc-600">{row.item}</span> : null}</td>
                      <td className="px-3 py-3 text-zinc-600"><PreviewTypeIcon type={row.type} /></td>
                      <td className="px-3 py-3 text-zinc-600"><span className={`inline-flex max-w-full rounded-md px-2 py-1 text-[0.68rem] font-semibold ${purposeClasses(row.purpose)}`}>{row.purpose}</span></td>
                      <td className="px-3 py-3 text-zinc-600"><span className={`inline-flex max-w-full rounded-md px-2 py-1 text-[0.68rem] font-semibold ${evidenceClasses(row.evidence)}`}>{row.evidence}</span></td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-zinc-600">{row.observed}</td>
                      <td className="px-3 py-3 font-mono text-zinc-600"><span className="block truncate" title={row.domains}>{row.domains}</span></td>
                      <td className="whitespace-nowrap px-3 py-3 text-zinc-600">{row.relationship}</td>
                      <td className="px-3 py-3 text-zinc-600"><ConfidenceDots confidence={row.confidence} /></td>
                      <td className="px-3 py-3 font-mono text-zinc-600">{row.requestCount ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mx-4 mb-4 border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs leading-5 text-zinc-600">
              No resource identities were returned by this early checkpoint. Continue to the completed report; this is not evidence that none were present.
            </p>
          )}
        </RuntimeInventorySummaryCard>
      </div>
    </section>
  );
}
