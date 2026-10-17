import { cmpCorrectionSteps } from "../../lib/scans/cmp-correction-steps";
import React, { type ReactNode } from "react";
import { CMP_AUDIT_CRITERIA, cmpDetailsExperience, cmpDetailsRecap, type CmpAuditProjection, type CmpAuditRow, type CmpAuditStatus } from "../../lib/scans/cmp-audit-projection";
import { EvidenceStatusBadge, type EvidenceBadgeTone } from "./evidence-status-badge";
import { DetailedEvidenceFinding } from "./detailed-evidence-finding";
import { DisclosureChevron } from "./report-finding-row";
import type { ShadowEvidenceRow } from "./report-lab/shadow-report-data";
import { evidenceRowAnchor } from "../../lib/scans/report-evidence-navigation";
import { EvidenceJumpLink } from "./evidence-jump-link";
import type { SharedEvidenceLink } from "./report-lab/detailed-evidence-layout";
import { EvidenceSectionHeader } from "./evidence-section-header";
import { EvidenceHeaderStatus, evidenceSectionRecap } from "./evidence-header-status";
import { CmpInventoryTable, CmpCookieMatch, CmpInventoryIdentity } from "./cmp-inventory-table";
import { VendorBrandChip } from "./vendor-brand-chip";
import { ConsentBannerViewer } from "./consent-banner-viewer";
import { PolicyLinkViewer } from "./policy-link-viewer";
import type { ConsentBannerPreview, ConsentRejectPreview, ConsentProminencePreview } from "../../lib/scans/visual-evidence";

const statusTone: Record<CmpAuditStatus, EvidenceBadgeTone> = {
  Informational: "neutral", "Feature not supported": "limited", Observed: "positive",
  "Incomplete": "limited", "Not applicable": "neutral", "Not observed": "neutral", "Review recommended": "review", "Partially assessed": "context", "Not assessed": "limited",
};

export function CmpDetails({ audit, vendor, compact = false, children, evidenceRows = [], sharedEvidence = {}, cookieEvidenceAnchor, rejectActionAvailable = false, relatedEvidence = [], bannerPreview, rejectPreview, prominencePreview }: {
  audit?: CmpAuditProjection;
  vendor: string | null;
  compact?: boolean;
  children?: ReactNode;
  evidenceRows?: readonly ShadowEvidenceRow[];
  sharedEvidence?: Record<string, SharedEvidenceLink>;
  cookieEvidenceAnchor?: string;
  rejectActionAvailable?: boolean;
  relatedEvidence?: Array<{ label: string; targetId: string }>;
  bannerPreview?: ConsentBannerPreview | null;
  rejectPreview?: ConsentRejectPreview | null;
  prominencePreview?: ConsentProminencePreview | null;
}) {
  const rows: CmpAuditRow[] = audit?.rows ?? CMP_AUDIT_CRITERIA.map(criterion => ({
    ...criterion, status: "Not assessed" as const, sourceIds: [],
  }));
  const grouped = new Set((audit?.limitationGroups ?? []).flatMap(group => group.criterionIds));
  const experience = cmpDetailsExperience(audit, vendor);
  const defaults = new Set(experience.defaultCriterionIds);
  const defaultRows = rows.filter(row => defaults.has(row.id) && !(experience.mode === "consent_signals"
    && row.id === "privacy_link" && row.status === "Observed"));
  const displayed = new Set(defaultRows.map(row => row.id));
  const additionalRows = rows.filter(row => !displayed.has(row.id));
  const visibleGroups = (audit?.limitationGroups ?? []).map(group => ({ ...group,
    criterionIds: group.criterionIds.filter(id => displayed.has(id)),
  })).filter(group => group.criterionIds.length);
  const unassessedRows = defaultRows.filter(row => row.status === "Not assessed" &&
    !row.supportingEvidence && !grouped.has(row.id));
  const foldedUnassessed = new Set(unassessedRows.length > 1 ? unassessedRows.map(row => row.id) : []);
  const renderRow = (row: CmpAuditRow) => {
    const source = evidenceRows.find(source => row.sourceIds.includes(source.id) || evidenceRowAnchor(source.id) === row.evidenceAnchor);
    const { id, label, status, detail, sourceIds, supportingEvidence } = row;
    const visualPreview = status === "Observed" && id === "banner" ? bannerPreview :
      status === "Observed" && id === "reject" ? rejectPreview :
      id === "prominence" && supportingEvidence?.prominence && ["Observed", "Review recommended", "Informational"].includes(status) ? prominencePreview : null;
    return <DetailedEvidenceFinding key={id} id={`cmp-criterion-${id}`} title={label}
      summary={row.limitation && detail === "This check depends on the incomplete preference inspection." ? undefined : detail} assessmentStatus={status}
      headerActions={visualPreview ? <ConsentBannerViewer preview={visualPreview} /> :
        id === "privacy_link" && status === "Observed" && source?.policyEvidence?.sourceUrl
          ? <PolicyLinkViewer sourceUrl={source.policyEvidence.sourceUrl} /> : null}
      sharedEvidence={sharedEvidence[id]}
      badge={<EvidenceStatusBadge label={status === "Review recommended" ? "Review" : status} tone={statusTone[status]} showIcon={statusTone[status] !== "review"} />}
      canonicalEvidenceJson={source?.canonicalEvidenceJson}
      evidenceRefs={source?.evidenceRefs ?? sourceIds}
      correctionSteps={source?.correctionSteps ?? cmpCorrectionSteps(row)}
      evidenceJson={{ scope: audit?.scope ?? "starting_page", scanId: audit?.scanId ?? null,
        assessmentSourceHash: audit?.assessmentSourceHash ?? null,
        criterion: { id, label, status, detail, sourceIds, supportingEvidence, limitation: row.limitation } }}>
      {id === "implementation" && source?.status === "Limited" && audit?.version === "cmp_audit_report.v3" && supportingEvidence?.inventory?.choiceActivity?.some(activity => activity.action === "reject") ?
        <span id="evidence-row-post_reject_tracking_reduction" data-shared-evidence-target="cmp-criterion-implementation" className="hidden" /> : null}
      {supportingEvidence ? <CmpSupportingEvidence evidence={supportingEvidence} /> : null}
      {id === "services" && status === "Observed" && !supportingEvidence?.inventory?.services?.length ?
        <p className="text-xs text-zinc-500">Service names were not saved in this report.</p> : null}
      {!sharedEvidence[id] && (id === "implementation" && rejectActionAvailable ?
        <EvidenceJumpLink targetId="post-reject-action-evidence" className="inline-block text-xs">View Reject action evidence ↓</EvidenceJumpLink> :
        id === "reject" && row.evidenceAnchor ? <EvidenceJumpLink targetId="consent-choice-controls" className="inline-block text-xs">View consent choices ↓</EvidenceJumpLink> :
        row.evidenceAnchor && !["implementation", "banner", "prominence", "reject"].includes(id) ? <EvidenceJumpLink targetId={row.evidenceAnchor} className="inline-block text-xs">View supporting evidence ↓</EvidenceJumpLink> : null)}
      {id === "cookie_information" && cookieEvidenceAnchor ? <EvidenceJumpLink targetId={cookieEvidenceAnchor} className="inline-block text-xs">View cookie-disclosure availability ↓</EvidenceJumpLink> : null}
    </DetailedEvidenceFinding>;
  };
  return <details id="cmp-details" className="group/cmp border-b border-r border-zinc-200 p-5">
    <EvidenceSectionHeader title={experience.title} recap={cmpDetailsRecap(experience, evidenceSectionRecap(rows))}
      badge={experience.mode === "cmp_details" ? <EvidenceHeaderStatus rows={rows} /> : experience.mode === "capture_limited"
        ? <EvidenceStatusBadge label="Limited" tone="limited" /> : <EvidenceHeaderStatus rows={defaultRows.filter(row => row.status === "Review recommended")} />} />
    <div className="mt-5">
      {experience.mode === "cmp_details" ? <VendorBrandChip label={experience.provider ?? "Consent platform not identified"} showMeta={false} /> :
        <p className="text-sm text-zinc-600">Provider: {experience.mode === "capture_limited" ? "Not determined" : "Not identified"}</p>}
      {experience.mode === "consent_controls" && experience.controls ? <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {(["accept", "reject", "options"] as const).map(role => <div key={role}>
          <dt className="font-semibold capitalize text-zinc-800">{role}</dt>
          <dd className="mt-1 text-zinc-600">{experience.controls![role] === "observed" ? "Observed" : "Not observed"}</dd>
        </div>)}
      </dl> : null}
      {experience.mode !== "cmp_details" && experience.mode !== "consent_signals" ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {experience.controls ? <EvidenceJumpLink targetId="consent-choice-controls">View consent choices</EvidenceJumpLink> : null}
        {relatedEvidence.map(link => <EvidenceJumpLink key={link.targetId} targetId={link.targetId}>{link.label}</EvidenceJumpLink>)}
      </div> : null}
      {experience.mode === "cmp_details" ? <h4 className="mt-4 text-xs font-semibold text-zinc-600">Consent management audit · {rows.length} criteria</h4> : null}
      {defaultRows.length ? <div className="mt-2 divide-y divide-zinc-200 border-t border-zinc-200">
        {defaultRows.filter(row => !grouped.has(row.id) && !foldedUnassessed.has(row.id)).map(renderRow)}
        {foldedUnassessed.size ? <details className="group/cmp-unassessed py-3" data-cmp-unassessed-checks>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-700 [&::-webkit-details-marker]:hidden">
            <span>Not assessed · {foldedUnassessed.size} checks</span>
            <DisclosureChevron className="text-zinc-400 group-open/cmp-unassessed:rotate-180" />
          </summary>
          <div className="mt-2 divide-y divide-zinc-200">{unassessedRows.map(renderRow)}</div>
        </details> : null}
        {visibleGroups.map(group => <details key={group.id} id={`cmp-limitation-${group.id}`} className="group/cmp-limitation py-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-800 [&::-webkit-details-marker]:hidden">
            <span className="flex items-start justify-between gap-3"><span>{group.title}<span className="mt-1 block text-xs font-normal text-zinc-500">{`${group.criterionIds.length} ${group.criterionIds.length === 1 ? "check" : "checks"} · View affected checks`}</span></span><span className="flex shrink-0 items-center gap-2"><EvidenceStatusBadge label="Incomplete" tone="limited" /><DisclosureChevron className="text-zinc-400 group-open/cmp-limitation:rotate-180" /></span></span>
          </summary>
          <div className="mt-2 divide-y divide-zinc-200">{defaultRows.filter(row => group.criterionIds.includes(row.id)).map(renderRow)}</div>
        </details>)}
      </div> : null}
      {experience.mode !== "consent_signals" && additionalRows.length ? <details className="mt-3" data-cmp-retained-checks>
        <summary className="cursor-pointer text-sm font-semibold text-zinc-700">All retained checks · {rows.length} criteria</summary>
        <p className="mt-2 text-xs text-zinc-500">{evidenceSectionRecap(rows)}</p>
        <div className="mt-2 divide-y divide-zinc-200">{additionalRows.map(renderRow)}</div>
      </details> : null}
      {experience.mode === "consent_signals" ? additionalRows.map(row =>
        <span key={row.id} id={`cmp-criterion-${row.id}`} data-shared-evidence-target="cmp-details" className="hidden" />) : null}
      {children}
    </div>
  </details>;
}

function CmpSupportingEvidence({ evidence }: { evidence: NonNullable<CmpAuditRow["supportingEvidence"]> }) {
  const comparison = evidence.prominence, cookies = evidence.cookieComparison, inventory = evidence.inventory;
  return <div className="mt-2 space-y-3 rounded-md bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
    {inventory?.consentStorage?.length ? <CmpInventoryTable label="Browser consent records" columns={["Choice", "Cookie", "Observed"]}
      copyRows={inventory.consentStorage.map(record => [record.visit, record.name, record.change === "updated" ? "Updated after choice" : "Stored after choice"])}
      rows={inventory.consentStorage.map(record => [record.visit, <CmpInventoryIdentity name={record.name} kind="cookie" />, record.change === "updated" ? "Updated after choice" : "Stored after choice"])} /> : null}
    {inventory?.choiceActivity?.map(activity => <React.Fragment key={activity.action}>
      <p className="font-semibold text-zinc-900">After {activity.action === "accept" ? "Accept" : "Reject"} · {activity.windowMs / 1000} seconds · {activity.requestCount} {activity.requestCount === 1 ? "request" : "requests"} · {activity.nonEssentialRequestCount} classified as non-essential</p>
      {activity.requests.length ? <CmpInventoryTable label={`Requests after ${activity.action === "accept" ? "Accept" : "Reject"} click · ${activity.requests.length}`}
        columns={["Service", "Purpose", "After click", "Request"]}
        copyRows={activity.requests.map(request => [request.vendor, request.purpose.replaceAll("_", " "), `+${request.msAfterClick} ms`, `${request.hostname}${request.path}`])}
        rows={activity.requests.map(request => [<CmpInventoryIdentity name={request.vendor} kind="service" />, request.purpose.replaceAll("_", " "), `+${request.msAfterClick} ms`, <span className="block max-w-[18rem] whitespace-normal break-all font-mono text-[11px] leading-4">{request.hostname}{request.path}</span>])} /> : null}
      {activity.requests.length < activity.requestCount ? <p>Showing {activity.requests.length} of {activity.requestCount} retained requests.</p> : null}
    </React.Fragment>)}
    {inventory?.choiceActivity?.length ? <p>Activity recorded within each capture window; request payloads were not assessed.</p> : null}
    {inventory?.expiries?.length ? <>
      <CmpInventoryTable label={`${inventory.expiries.some(item => item.visit === "Before choice") ? "CMP cookie expiry" : "Consent-cookie expiry"} · ${inventory.expiries.length}`} columns={["Capture", "Cookie", "Remaining days"]}
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
        copyRows={inventory.services.map(service => [service.name, service.source === "cmp_api_inventory" ? "CMP configuration" : service.source === "cmp_named_disclosure" ? "CMP disclosure" : "Labelled control"])}
        rows={inventory.services.map(service => [<CmpInventoryIdentity name={service.name} kind="service" />, service.source === "cmp_api_inventory" ? "CMP configuration" : service.source === "cmp_named_disclosure" ? "CMP disclosure" : "Labelled control"])} />
    </> : null}
    {inventory?.declarations?.length ? <>
      <CmpInventoryTable label={`Cookie details · ${inventory.declarations.length}`}
        columns={["Cookie name / pattern", "CMP-stated purpose", ...(inventory.declarations.some(cookie => cookie.inferredPurpose) ? ["Inferred purpose"] : []), "CMP-stated retention", ...(inventory.declarations.some(cookie => cookie.observedExpiry) ? ["Observed time remaining"] : [])]}
        copyRows={inventory.declarations.map(cookie => [cookie.name, cookie.purpose || "Not captured", ...(inventory.declarations!.some(item => item.inferredPurpose) ? [cookie.inferredPurpose?.category.replaceAll("_", " ") ?? "Unclassified"] : []), disclosureText(cookie.duration) || "Not captured", ...(inventory.declarations!.some(item => item.observedExpiry) ? [cookie.observedExpiry ? `${formatRemainingDays(cookie.observedExpiry.remainingSeconds)} days` : "—"] : [])])}
        rows={inventory.declarations.map(cookie => [<CmpInventoryIdentity name={cookie.name} kind="cookie" />, cookie.purpose || "Not captured", ...(inventory.declarations!.some(item => item.inferredPurpose) ? [cookie.inferredPurpose?.category.replaceAll("_", " ") ?? "Unclassified"] : []), disclosureText(cookie.duration) || "Not captured", ...(inventory.declarations!.some(item => item.observedExpiry) ? [cookie.observedExpiry ? `${formatRemainingDays(cookie.observedExpiry.remainingSeconds)} days` : "—"] : [])])} />
      {inventory.declarations.some(cookie => cookie.observedExpiry) ? <p>Time remaining was measured after the Accept click, separately from CMP-stated retention.</p> : null}
    </> : null}
    {inventory?.declarations?.some(cookie => cookie.inferredPurpose) ? <p>Inferred purposes use CertScore’s cookie registry, separately from the CMP’s descriptions.</p> : null}
    {inventory?.cookies?.length && !cookies ? <CookieMatchTable entries={inventory.cookies} /> : null}
    {comparison ? <>
      <CmpInventoryTable label="Accept / Reject comparison" columns={["Control", "Size (px)", "Fill contrast"]}
        copyRows={(["accept", "reject"] as const).map(role => [role === "accept" ? "Accept" : "Reject / necessary only", `${comparison[role].bounds[2]} × ${comparison[role].bounds[3]}`, `${comparison[role].fillContrast.toFixed(3)}:1`])}
        rows={(["accept", "reject"] as const).map(role => [role === "accept" ? "Accept" : "Reject / necessary only", `${comparison[role].bounds[2]} × ${comparison[role].bounds[3]}`, `${comparison[role].fillContrast.toFixed(3)}:1`])} />
      <p>Button sizes and screenshot were captured {comparison.captureSkewMs} ms apart on the starting page. Fill contrast compares button backgrounds, not text readability.</p>
    </> : null}
    {evidence.requests?.length && !inventory?.choiceActivity?.some(activity => activity.action === "reject") ? <>
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
      {inventory?.cookies?.length ? <CookieMatchTable entries={inventory.cookies} partial={cookies?.declarationInventoryComplete === false} /> :
        <CmpInventoryTable label="Unmatched cookie names" columns={["Cookie name", "CMP match"]}
          copyRows={cookies.unmatchedNames.map(name => [name, "No match"])}
          rows={cookies.unmatchedNames.map(name => [<CmpInventoryIdentity name={name} kind="cookie" />, <CmpCookieMatch matched={false} />])} />}
      {inventory?.cookies?.length && inventory.cookies.length < cookies.observedCookieNameCount ? <p>Showing {inventory.cookies.length} of {cookies.observedCookieNameCount} compared cookie names.</p> : null}
      {!inventory?.cookies?.length ? <p>Only unmatched names were saved in this report; matched-cookie rows are unavailable.</p> : null}
      {!inventory?.cookies?.length && cookies.unmatchedNames.length < cookies.unmatchedNameCount ? <p>Showing {cookies.unmatchedNames.length} of {cookies.unmatchedNameCount} unmatched names.</p> : null}
      {cookies.declarationInventoryComplete === false ? <p>Compared with a partial CMP list. Unmatched names are not confirmed omissions.</p> : <p>{cookies.allUnmatchedOnlyAfterAccept ? "The unmatched cookies were found after Accept and were not seen before consent. " : "Cookies found during the scan were compared with the CMP list. "}Names alone do not show each cookie’s purpose or consent requirements.</p>}
    </> : null}
  </div>;
}

function CookieMatchTable({ entries, partial = false }: { partial?: boolean; entries: NonNullable<NonNullable<NonNullable<CmpAuditRow["supportingEvidence"]>["inventory"]>["cookies"]> }) {
  // Match results come from the canonical assessment; the component never runs
  // a second matcher or infers a purpose from a name.
  const hasExpiry = entries.some(cookie => cookie.observedExpiry);
  const matchText = (cookie: typeof entries[number]) => cookie.matchedPattern !== null ? "Matched" : cookie.possibleTemplateMatch ? "Possible template match" : partial ? "No match in captured list" : "No match";
  return <>
    <CmpInventoryTable label={`Cookie matches · ${entries.length}`} columns={["Cookie name", "CMP match", "CMP pattern", "Observed", ...(hasExpiry ? ["Observed time remaining"] : [])]}
      copyRows={entries.map(cookie => [cookie.name, matchText(cookie), cookie.matchedPattern ?? cookie.possibleTemplateMatch?.pattern ?? "—", cookie.observedIn.map(phase => phase === "before_choice" ? "Before choice" : "After Accept click").join(" · "), ...(hasExpiry ? [cookie.observedExpiry ? `${formatRemainingDays(cookie.observedExpiry.remainingSeconds)} days` : "—"] : [])])}
      rows={entries.map(cookie => [<CmpInventoryIdentity name={cookie.name} kind="cookie" />, cookie.possibleTemplateMatch ? <span className="text-zinc-600">Possible template match</span> : <CmpCookieMatch matched={cookie.matchedPattern !== null} partial={partial} />,
        <span className="font-mono text-[11px]">{cookie.matchedPattern ?? cookie.possibleTemplateMatch?.pattern ?? "—"}</span>,
        cookie.observedIn.map(phase => phase === "before_choice" ? "Before choice" : "After Accept click").join(" · "), ...(hasExpiry ? [cookie.observedExpiry ? `${formatRemainingDays(cookie.observedExpiry.remainingSeconds)} days` : "—"] : [])])} />
    {entries.some(cookie => cookie.possibleTemplateMatch) ? <p>Possible template matches are name similarities, not verified CMP matches.</p> : null}
    {hasExpiry ? <p>Observed time remaining is measured after the Accept click, not the original cookie lifetime.</p> : null}
  </>;
}

function disclosureText(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function formatRemainingDays(seconds: number) {
  return Number((seconds / 86400).toFixed(8)).toString();
}
