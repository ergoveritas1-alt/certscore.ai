"use client";

import type { AccessibilityAuditObservation, AccessibilityRuleObservation } from "@certscore/contracts";
import type { ApiAccessibilityAuditSummary } from "@certscore/api-contracts";
import { ACCESSIBILITY_REPORT_LABEL, accessibilityImpactLabel, accessibilityIssueCountLabel, accessibilityRuleTitle } from "../../lib/scans/accessibility-report";
import { accessibilityFindingCopy } from "./accessibility-finding-copy";
import { EvidenceJumpLink } from "./evidence-jump-link";
import { DetailedEvidenceFinding } from "./detailed-evidence-finding";
import { DisclosureChevron } from "./report-finding-row";
import { EvidenceStatusBadge } from "./evidence-status-badge";
import { EvidenceSectionHeader } from "./evidence-section-header";
import { accessibilityAuditUnavailableSummary, accessibilityEvidenceRecap } from "../../lib/scans/detailed-evidence-presentation";
import { accessibilityReportFollowUp, REPORT_FOLLOW_UP } from "../../lib/scans/report-status-presentation";

type Props = { audit: ApiAccessibilityAuditSummary; observation?: AccessibilityAuditObservation | null };

export function AccessibilitySnapshotContent({ audit, observation }: Props) {
  return <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-600">
    {observation?.violations.length ? <ul className="list-disc space-y-1 pl-4">
      {observation.violations.slice(0, 5).map(rule => <li key={rule.ruleId}>{accessibilityRuleTitle(rule)}</li>)}
      {observation.violations.length > 5 ? <li>{observation.violations.length - 5} more issues</li> : null}
    </ul> : <p>{audit.failedRuleCount === null ? accessibilityAuditUnavailableSummary(observation?.limitations) : audit.failedRuleCount === 0 ? observation?.frameCoverage ? "Main-page checks needing review are retained below." : "No failures detected in the evaluated checks." : `${accessibilityIssueCountLabel(audit)} recorded; detailed examples are unavailable.`}</p>}
    <EvidenceJumpLink targetId="accessibility-evidence" className="inline-block">View accessibility issues &amp; evidence ↓</EvidenceJumpLink>
  </div>;
}

function AccessibilityExample({ node }: { node: AccessibilityRuleObservation["representativeNodes"][number] }) {
  const explanation = node.failureSummary.replace(/^Fix (?:any|all) of the following:\s*/i, "");
  const contrast = node.colorContrast;
  const contrastAlreadyDescribed = contrast?.contrastRatio != null && contrast.requiredContrastRatio != null
    && explanation.includes(`contrast of ${contrast.contrastRatio}`)
    && explanation.includes(`contrast ratio of ${contrast.requiredContrastRatio}`);
  return <div className="min-w-0 space-y-2 border-l-2 border-zinc-200 pl-3">
    <p className="break-words font-mono text-[0.68rem]">{node.selectors.map(selector => Array.isArray(selector) ? selector.join(" >>> ") : selector).join(", ")}</p>
    {node.captureState === "opened_navigation_menu" ? <p>Observed in an opened navigation menu.</p> : null}
    <p className="whitespace-pre-line break-words">{explanation}</p>
    {node.colorContrast && !contrastAlreadyDescribed ? <p>Contrast ratio: {node.colorContrast.contrastRatio ?? "Not captured"}; required: {node.colorContrast.requiredContrastRatio ?? "Not captured"}.</p> : null}
    <pre className="max-w-full overflow-x-auto rounded bg-zinc-50 p-2 text-[0.68rem]">{node.htmlSnippet}</pre>
  </div>;
}

function RuleEvidence({ rule, review = false }: { rule: AccessibilityRuleObservation; review?: boolean }) {
  const { description, correction } = accessibilityFindingCopy(rule, review);
  return <DetailedEvidenceFinding title={accessibilityRuleTitle(rule)}
    summary={`${rule.nodeCount} ${rule.nodeCount === 1 ? "element" : "elements"}${review ? " to review" : " affected"}`}
    badge={<EvidenceStatusBadge label={review ? REPORT_FOLLOW_UP.manual.label : "Issues found"} description={review ? REPORT_FOLLOW_UP.manual.description : REPORT_FOLLOW_UP.review.description} tone={review ? "limited" : "review"} showIcon={false} />}
    correctionSteps={[correction]} evidenceJson={{ accessibilityRule: rule }}>
    <div className="mt-3 space-y-3 text-xs leading-5 text-zinc-600">
      {description ? <p>{description}</p> : null}
      <p>Impact: {accessibilityImpactLabel(rule.impact)}</p>
      <p className="break-words">WCAG criteria: {rule.tags.filter(tag => /^wcag\d{3,4}$/.test(tag)).map(tag => `${tag[4]}.${tag[5]}.${tag.slice(6)}`).join(", ") || rule.tags.filter(tag => tag.startsWith("wcag")).join(", ")}</p>
      <a className="font-semibold text-sky-700 underline" href={rule.helpUrl} target="_blank" rel="noreferrer">WCAG guidance &amp; remediation ↗</a>
      <p className="font-semibold text-zinc-800">Examples ({rule.representativeNodes.length} of {rule.nodeCount})</p>
      {rule.representativeNodes[0] ? <AccessibilityExample node={rule.representativeNodes[0]} /> : null}
      {rule.representativeNodes.length > 1 ? <details className="group/examples">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 [&::-webkit-details-marker]:hidden">
          <span className="group-open/examples:hidden">Show more examples ({rule.representativeNodes.length - 1})</span>
          <span className="hidden group-open/examples:inline">Show fewer examples</span>
          <DisclosureChevron className="text-zinc-400 group-open/examples:rotate-180" />
        </summary>
        <div className="mt-3 space-y-3">{rule.representativeNodes.slice(1).map((node, index) => <AccessibilityExample key={index} node={node} />)}</div>
      </details> : null}
    </div>
  </DetailedEvidenceFinding>;
}

export function AccessibilityEvidence({ audit, observation }: Props) {
  const followUp = accessibilityReportFollowUp(audit);
  return <details id="accessibility-evidence" className="group/accessibility border-b border-r border-zinc-200 p-5">
    <EvidenceSectionHeader title={ACCESSIBILITY_REPORT_LABEL}
      recap={accessibilityEvidenceRecap(audit, observation?.limitations)}
      badge={followUp ? <EvidenceStatusBadge label={followUp.label} description={followUp.description} tone={followUp.kind === "review" ? "review" : "limited"} /> : null} />
    <div className="mt-5 space-y-3 text-xs leading-5 text-zinc-600">
      <p>WCAG 2.2 A/AA automated checks on the starting page.</p>
      <p>{audit.engine}{audit.engineVersion ? ` ${audit.engineVersion}` : ""}{observation?.frameCoverage ? ` · ${observation.frameCoverage.engineRuleCount} rules run` : observation?.rulesEvaluated.length ? ` · ${observation.rulesEvaluated.length} rules evaluated` : ""}</p>
      {observation?.frameCoverage ? <p className="text-amber-800">Main-page findings retained. Embedded-frame results could not be verified.</p> : audit.status !== "completed" ? <p className="text-amber-800">{audit.failedRuleCount === null ? accessibilityAuditUnavailableSummary(observation?.limitations) : `Coverage is limited${audit.reviewRuleCount ? `: ${audit.reviewRuleCount} ${audit.reviewRuleCount === 1 ? "check needs" : "checks need"} manual review` : ""}.`}</p> : null}
      {audit.failedRuleCount === 0 && !observation?.frameCoverage ? <p>No failures detected in the evaluated checks.</p> : null}
      {audit.failedRuleCount !== null && audit.failedRuleCount > 0 && !observation?.violations.length ? <p>Detailed examples are unavailable.</p> : null}
    </div>
    <div className="mt-4 divide-y divide-zinc-200 border-t border-zinc-200">
      {observation?.violations.map(rule => <RuleEvidence key={rule.ruleId} rule={rule} />)}
    </div>
    {observation?.reviewItems.length ? <div className="mt-4"><p className="text-xs font-semibold text-zinc-800">Manual checks</p>
      <div className="mt-2 divide-y divide-zinc-200 border-t border-zinc-200">{observation.reviewItems.map(rule => <RuleEvidence key={rule.ruleId} rule={rule} review />)}</div>
    </div> : null}
  </details>;
}
