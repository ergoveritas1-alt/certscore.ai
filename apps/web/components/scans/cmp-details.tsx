import { EVIDENCE_SECTION_TITLES } from "../../lib/scans/detailed-evidence-presentation";
import { cmpCorrectionSteps } from "../../lib/scans/cmp-correction-steps";
import React, { type ReactNode } from "react";
import { CMP_AUDIT_CRITERIA, type CmpAuditProjection, type CmpAuditRow, type CmpAuditStatus } from "../../lib/scans/cmp-audit-projection";
import { EvidenceStatusBadge, type EvidenceBadgeTone } from "./evidence-status-badge";
import { DetailedEvidenceFinding } from "./detailed-evidence-finding";
import type { ShadowEvidenceRow } from "./report-lab/shadow-report-data";
import { evidenceRowAnchor } from "../../lib/scans/report-evidence-navigation";
import { EvidenceJumpLink } from "./evidence-jump-link";
import type { SharedEvidenceLink } from "./report-lab/detailed-evidence-layout";
import { EvidenceSectionHeader } from "./evidence-section-header";
import { EvidenceHeaderStatus, evidenceSectionRecap } from "./evidence-header-status";
import { CmpInventoryTable, CmpCookieMatch, CmpInventoryIdentity } from "./cmp-inventory-table";
import { VendorBrandChip } from "./vendor-brand-chip";
import { ConsentBannerViewer } from "./consent-banner-viewer";
import type { ConsentBannerPreview } from "../../lib/scans/visual-evidence";

const statusTone: Record<CmpAuditStatus, EvidenceBadgeTone> = {
  Informational: "neutral", "Feature not supported": "limited", Observed: "positive",
  "Not observed": "neutral", "Review recommended": "review", "Partially assessed": "context", "Not assessed": "limited",
};

export function CmpDetails({ audit, vendor, compact = false, children, evidenceRows = [], sharedEvidence = {}, cookieEvidenceAnchor, rejectActionAvailable = false, bannerPreview }: {
  audit?: CmpAuditProjection;
  vendor: string | null;
  compact?: boolean;
  children?: ReactNode;
  evidenceRows?: readonly ShadowEvidenceRow[];
  sharedEvidence?: Record<string, SharedEvidenceLink>;
  cookieEvidenceAnchor?: string;
  rejectActionAvailable?: boolean;
  bannerPreview?: ConsentBannerPreview | null;
}) {
  const rows: CmpAuditRow[] = audit?.rows ?? CMP_AUDIT_CRITERIA.map(criterion => ({
    ...criterion, status: "Not assessed" as const, sourceIds: [],
  }));
  return <details id="cmp-details" className="group/cmp border-b border-r border-zinc-200 p-5">
    <EvidenceSectionHeader title={EVIDENCE_SECTION_TITLES.cmp} recap={evidenceSectionRecap(rows)} badge={<EvidenceHeaderStatus rows={rows} />} />
    <div className="mt-5">
      <VendorBrandChip label={vendor ?? "Consent platform not identified"} showMeta={false} />
      <h4 className="mt-4 text-xs font-semibold text-zinc-600">Consent management audit · {rows.length} criteria</h4>
      <div className="mt-2 divide-y divide-zinc-200 border-t border-zinc-200">
        {rows.map(row => {
          const source = evidenceRows.find(source => row.sourceIds.includes(source.id) || evidenceRowAnchor(source.id) === row.evidenceAnchor);
          const { id, label, status, detail, sourceIds, supportingEvidence } = row;
          return <DetailedEvidenceFinding key={id} id={`cmp-criterion-${id}`} title={label} summary={detail} assessmentStatus={status}
            headerActions={id === "banner" && status === "Observed" && bannerPreview ? <ConsentBannerViewer preview={bannerPreview} /> : null}
            sharedEvidence={sharedEvidence[id]}
            badge={<EvidenceStatusBadge label={status === "Review recommended" ? "Review" : status} tone={statusTone[status]} showIcon={statusTone[status] !== "review"} />}
            canonicalEvidenceJson={source?.canonicalEvidenceJson}
            evidenceRefs={source?.evidenceRefs ?? sourceIds}
            correctionSteps={source?.correctionSteps ?? cmpCorrectionSteps(row)}
            evidenceJson={{ scope: audit?.scope ?? "starting_page", scanId: audit?.scanId ?? null,
              assessmentSourceHash: audit?.assessmentSourceHash ?? null,
              criterion: { id, label, status, detail, sourceIds, supportingEvidence } }}>
            {supportingEvidence ? <CmpSupportingEvidence evidence={supportingEvidence} /> : null}
            {id === "services" && status === "Observed" && !supportingEvidence?.inventory?.services?.length ?
              <p className="text-xs text-zinc-500">Service names were not saved in this report.</p> : null}
            {!sharedEvidence[id] && (id === "implementation" && rejectActionAvailable ?
              <EvidenceJumpLink targetId="post-reject-action-evidence" className="inline-block text-xs">View Reject action evidence ↓</EvidenceJumpLink> :
              id === "reject" && row.evidenceAnchor ? <EvidenceJumpLink targetId="consent-choice-controls" className="inline-block text-xs">View consent choices ↓</EvidenceJumpLink> :
              row.evidenceAnchor && !["implementation", "banner", "prominence", "reject"].includes(id) ? <EvidenceJumpLink targetId={row.evidenceAnchor} className="inline-block text-xs">View supporting evidence ↓</EvidenceJumpLink> : null)}
            {id === "cookie_information" && cookieEvidenceAnchor ? <EvidenceJumpLink targetId={cookieEvidenceAnchor} className="inline-block text-xs">View cookie-disclosure availability ↓</EvidenceJumpLink> : null}
          </DetailedEvidenceFinding>;
        })}
      </div>
      {children}
    </div>
  </details>;
}

function CmpSupportingEvidence({ evidence }: { evidence: NonNullable<CmpAuditRow["supportingEvidence"]> }) {
  const comparison = evidence.prominence, cookies = evidence.cookieComparison, inventory = evidence.inventory;
  return <div className="mt-2 space-y-3 rounded-md bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
    {inventory?.expiries?.length ? <>
      <CmpInventoryTable label={`Consent-cookie expiry · ${inventory.expiries.length}`} columns={["Visit", "Cookie", "Remaining days"]}
        columnClasses={["w-[20%] sm:w-auto", "w-[45%] sm:w-auto", "w-[35%] sm:w-auto"]}
        copyRows={inventory.expiries.map(cookie => [cookie.visit, cookie.name, formatRemainingDays(cookie.remainingSeconds)])}
        rows={inventory.expiries.map(cookie => [cookie.visit, <CmpInventoryIdentity name={cookie.name} kind="cookie" />, formatRemainingDays(cookie.remainingSeconds)])} />
      <p>Time remaining when the cookie was captured.</p>
    </> : null}
    {inventory?.categories?.length ? <CmpInventoryTable label={`Category choices · ${inventory.categories.length}`} columns={["Category", "Captured setting"]}
      copyRows={inventory.categories.map(category => [category.name, category.checked === null ? "Not captured" : category.checked ? "On" : "Off"])}
      rows={inventory.categories.map(category => [category.name, category.checked === null ? "Not captured" : category.checked ? "On" : "Off"])} /> : null}
    {inventory?.services?.length ? <>
      <CmpInventoryTable label={`CMP services · ${inventory.services.length}`} columns={["Service", "Identified from"]}
        copyRows={inventory.services.map(service => [service.name, service.source === "cmp_api_inventory" ? "CMP configuration" : "Labelled control"])}
        rows={inventory.services.map(service => [<CmpInventoryIdentity name={service.name} kind="service" />, service.source === "cmp_api_inventory" ? "CMP configuration" : "Labelled control"])} />
    </> : null}
    {inventory?.declarations?.length ? <CmpInventoryTable label={`Cookie details · ${inventory.declarations.length}`}
      columns={["Cookie name / pattern", "Purpose", "Storage duration"]}
      copyRows={inventory.declarations.map(cookie => [cookie.name, cookie.purpose || "Not listed", disclosureText(cookie.duration) || "Not listed"])}
      rows={inventory.declarations.map(cookie => [<CmpInventoryIdentity name={cookie.name} kind="cookie" />, cookie.purpose || "Not listed", disclosureText(cookie.duration) || "Not listed"])} /> : null}
    {inventory?.cookies?.length && !cookies ? <CookieMatchTable entries={inventory.cookies} /> : null}
    {comparison ? <>
      <CmpInventoryTable label="Accept / Reject comparison" columns={["Control", "Size (px)", "Fill contrast"]}
        copyRows={(["accept", "reject"] as const).map(role => [role === "accept" ? "Accept" : "Reject / necessary only", `${comparison[role].bounds[2]} × ${comparison[role].bounds[3]}`, `${comparison[role].fillContrast.toFixed(3)}:1`])}
        rows={(["accept", "reject"] as const).map(role => [role === "accept" ? "Accept" : "Reject / necessary only", `${comparison[role].bounds[2]} × ${comparison[role].bounds[3]}`, `${comparison[role].fillContrast.toFixed(3)}:1`])} />
      <p>Button sizes and screenshot were captured {comparison.captureSkewMs} ms apart on the starting page. Fill contrast compares button backgrounds, not text readability.</p>
    </> : null}
    {evidence.requests?.length ? <>
      <CmpInventoryTable label={`Requests after confirmed Reject · ${evidence.requests.length}`}
        columns={["Service", "Category", "After Reject", "Request"]}
        columnClasses={["w-[15%] sm:w-auto", "w-[15%] sm:w-auto", "w-[15%] sm:w-auto", "w-[55%] sm:w-auto"]}
        copyRows={evidence.requests.map(request => [request.vendor, request.category, `+${request.msAfterReject} ms`, `${request.hostname}${request.path}`])}
        rows={evidence.requests.map(request => [<CmpInventoryIdentity name={request.vendor} kind="service" />, request.category, <span className="whitespace-nowrap">+{request.msAfterReject} ms</span>,
          <span className="block max-w-[18rem] whitespace-normal break-all font-mono text-[11px] leading-4">
            <span className="block">{request.hostname}</span><span className="block text-zinc-500">{request.path}</span>
          </span>])} />
      <p>These requests were recorded during the post-Reject check. The data sent by them was not assessed.</p>
    </> : null}
    {cookies ? <>
      {!inventory?.cookies?.length ? <p className="font-semibold text-zinc-900">Unmatched cookie names · {cookies.unmatchedNameCount}</p> : null}
      <p>{cookies.observedCookieNameCount} cookie names checked against {cookies.declarationPatternCount} CMP patterns, including wildcards.</p>
      {inventory?.cookies?.length ? <CookieMatchTable entries={inventory.cookies} /> :
        <CmpInventoryTable label="Unmatched cookie names" columns={["Cookie name", "CMP match"]}
          copyRows={cookies.unmatchedNames.map(name => [name, "No match"])}
          rows={cookies.unmatchedNames.map(name => [<CmpInventoryIdentity name={name} kind="cookie" />, <CmpCookieMatch matched={false} />])} />}
      {inventory?.cookies?.length && inventory.cookies.length < cookies.observedCookieNameCount ? <p>Showing {inventory.cookies.length} of {cookies.observedCookieNameCount} compared cookie names.</p> : null}
      {!inventory?.cookies?.length ? <p>Only unmatched names were saved in this report; matched-cookie rows are unavailable.</p> : null}
      {!inventory?.cookies?.length && cookies.unmatchedNames.length < cookies.unmatchedNameCount ? <p>Showing {cookies.unmatchedNames.length} of {cookies.unmatchedNameCount} unmatched names.</p> : null}
      <p>{cookies.allUnmatchedOnlyAfterAccept ? "The unmatched cookies were found after Accept and were not seen before consent. " : "Cookies found during the scan were compared with the CMP list. "}Names alone do not show each cookie’s purpose or consent requirements.</p>
    </> : null}
  </div>;
}

function CookieMatchTable({ entries }: { entries: NonNullable<NonNullable<NonNullable<CmpAuditRow["supportingEvidence"]>["inventory"]>["cookies"]> }) {
  // Match results come from the canonical assessment; the component never runs
  // a second matcher or infers a purpose from a name.
  return <CmpInventoryTable label={`Cookie matches · ${entries.length}`} columns={["Cookie name", "CMP match", "CMP pattern", "Observed"]}
    copyRows={entries.map(cookie => [cookie.name, cookie.matchedPattern !== null ? "Matched" : "No match", cookie.matchedPattern ?? "—", cookie.observedIn.map(phase => phase === "before_choice" ? "Before choice" : "After Accept").join(" · ")])}
    rows={entries.map(cookie => [<CmpInventoryIdentity name={cookie.name} kind="cookie" />, <CmpCookieMatch matched={cookie.matchedPattern !== null} />,
      <span className="font-mono text-[11px]">{cookie.matchedPattern ?? "—"}</span>,
      cookie.observedIn.map(phase => phase === "before_choice" ? "Before choice" : "After Accept").join(" · ")])} />;
}

function disclosureText(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function formatRemainingDays(seconds: number) {
  return Number((seconds / 86400).toFixed(8)).toString();
}
