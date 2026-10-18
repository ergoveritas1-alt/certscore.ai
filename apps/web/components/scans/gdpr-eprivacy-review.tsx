import React, { type ReactNode } from "react";
import type { ShadowEvidenceRow } from "./report-lab/shadow-report-data";
import { EvidenceJumpLink } from "./evidence-jump-link";
import { DisclosureChevron } from "./report-finding-row";

const DISCLOSURE_LABELS: Record<string, string> = {
  controller_contact_disclosure: "Controller/contact",
  processing_purposes_disclosure: "Processing purposes",
  legal_basis_disclosure_observed: "Legal basis",
  recipients_vendor_categories_disclosure: "Recipients",
  retention_disclosure: "Retention",
  retention_disclosure_observed: "Retention",
  retention_disclosure_present: "Retention",
  international_transfers_disclosure: "International transfers",
  automated_decision_making_profiling_disclosure: "Profiling / automated decisions",
};
const RIGHTS_LABELS: Record<string, string> = {
  data_subject_rights_disclosure: "Data subject rights",
  dpo_contact_point_disclosure: "DPO contact",
  supervisory_authority_complaint_disclosure: "Complaint route",
};
type ReviewProps = {
  rows: readonly Pick<ShadowEvidenceRow, "id" | "status">[];
  policyUrls?: readonly string[];
};

/** Summarize already-projected positive evidence only; never infer disclosure
 * presence from raw text, missing rows, or a review/limited assessment. */
function capturedEvidence({ rows, policyUrls = [] }: ReviewProps) {
  const observed = rows.filter(row => row.status === "Observed");
  const disclosures = [...new Set(observed.flatMap(row => Object.hasOwn(DISCLOSURE_LABELS, row.id) ? [DISCLOSURE_LABELS[row.id]!] : []))];
  const rights = [...new Set(observed.flatMap(row => Object.hasOwn(RIGHTS_LABELS, row.id) ? [RIGHTS_LABELS[row.id]!] : []))];
  const urls = [...new Set(policyUrls)];
  const sources = [...new Set(urls.flatMap(url => {
    try { return [new URL(url).hostname]; } catch { return []; }
  }))];
  return { disclosures, rights, urls, sources, topicCount: disclosures.length + rights.length };
}

export function GdprEprivacyCoverageSummary(props: ReviewProps) {
  const evidence = capturedEvidence(props);
  return <details className="group/signal border-b border-zinc-200 py-2" data-gdpr-eprivacy-coverage>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs leading-4 [&::-webkit-details-marker]:hidden">
      <span className="text-xs font-medium text-zinc-500">GDPR/ePrivacy coverage</span>
      <span className="flex items-center gap-2 text-xs font-semibold text-zinc-800">{evidence.topicCount} {evidence.topicCount === 1 ? "topic" : "topics"} captured<DisclosureChevron className="text-zinc-400 group-open/signal:rotate-180" /></span>
    </summary>
    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-600">
      <p>{evidence.urls.length} policy {evidence.urls.length === 1 ? "document" : "documents"} · {evidence.topicCount} disclosure {evidence.topicCount === 1 ? "topic" : "topics"} captured</p>
      <EvidenceJumpLink targetId="gdpr-eprivacy-evidence" className="inline-block text-xs">View GDPR/ePrivacy evidence ↓</EvidenceJumpLink>
    </div>
  </details>;
}

export function GdprEprivacyReview({ children, ...props }: ReviewProps & { children: ReactNode }) {
  const evidence = capturedEvidence(props);
  return <div className="mt-4 space-y-3 text-xs leading-5 text-zinc-700">
    <dl className="space-y-2" data-gdpr-eprivacy-review-summary>
      {evidence.sources.length ? <div><dt className="font-semibold text-zinc-800">Policy sources captured</dt><dd>{evidence.sources.join(" · ")}</dd></div> : null}
      {evidence.disclosures.length ? <div><dt className="font-semibold text-zinc-800">Disclosures captured</dt><dd>{evidence.disclosures.join(" · ")}</dd></div> : null}
      {evidence.rights.length ? <div><dt className="font-semibold text-zinc-800">Rights and contact wording</dt><dd>{evidence.rights.join(" · ")}</dd></div> : null}
    </dl>
    {!evidence.sources.length && !evidence.topicCount ? <p>Capture details are available below.</p> : null}
    <details className="border-t border-zinc-200 pt-3" data-gdpr-eprivacy-review-details>
      <summary className="cursor-pointer font-medium text-zinc-600">Evidence &amp; assessment details</summary>
      {children}
    </details>
  </div>;
}
