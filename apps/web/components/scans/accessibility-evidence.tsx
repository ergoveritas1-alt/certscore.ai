"use client";

import type { AccessibilityAuditObservation, AccessibilityRuleObservation } from "@certscore/contracts";
import type { ApiAccessibilityAuditSummary } from "@certscore/api-contracts";
import { ACCESSIBILITY_REPORT_LABEL, accessibilityImpactLabel, accessibilityIssueCountLabel, accessibilityRuleTitle } from "../../lib/scans/accessibility-report";
import { DisclosureChevron, EvidenceTools } from "./report-finding-row";
import { EvidenceStatusBadge } from "./evidence-status-badge";
import { reportCardTitle } from "./report-typography";

type Props = { audit: ApiAccessibilityAuditSummary; observation?: AccessibilityAuditObservation | null };

export function AccessibilitySnapshotContent({ audit, observation }: Props) {
  return <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-600">
    {observation?.violations.length ? <ul className="list-disc space-y-1 pl-4">
      {observation.violations.slice(0, 5).map(rule => <li key={rule.ruleId}>{accessibilityRuleTitle(rule)}</li>)}
      {observation.violations.length > 5 ? <li>{observation.violations.length - 5} more issues</li> : null}
    </ul> : <p>{audit.failedRuleCount === null ? "The audit did not return evaluable results." : audit.failedRuleCount === 0 ? "No failures detected in the evaluated checks." : `${accessibilityIssueCountLabel(audit)} recorded; detailed examples are unavailable.`}</p>}
    <a className="inline-block font-semibold text-sky-700 hover:text-sky-900" href="#accessibility-evidence" onClick={() => {
      document.getElementById("accessibility-evidence")?.setAttribute("open", "");
    }}>View accessibility issues &amp; evidence ↓</a>
  </div>;
}

function RuleEvidence({ rule, review = false }: { rule: AccessibilityRuleObservation; review?: boolean }) {
  return <details className="group/accessibility-rule py-3">
    <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0 text-sm font-semibold text-zinc-950">{accessibilityRuleTitle(rule)}</span>
      <span className="col-span-2 row-start-2 text-xs leading-5 text-zinc-600">{rule.nodeCount} {rule.nodeCount === 1 ? "element instance" : "element instances"} · {rule.ruleId}</span>
      <span className="col-start-2 row-start-1 flex shrink-0 items-center gap-2"><EvidenceStatusBadge label={review ? "Needs review" : accessibilityImpactLabel(rule.impact)} tone={review ? "review" : rule.impact === "critical" || rule.impact === "serious" ? "concern" : "review"} /><DisclosureChevron className="text-zinc-400 group-open/accessibility-rule:rotate-180" /></span>
    </summary>
    <div className="mt-3 space-y-3 text-xs leading-5 text-zinc-600">
      <p>{rule.description}</p>
      <p>{rule.help}</p>
      <p className="break-words">WCAG references: {rule.tags.filter(tag => /^wcag\d{3,4}$/.test(tag)).map(tag => `${tag[4]}.${tag[5]}.${tag.slice(6)}`).join(", ") || rule.tags.filter(tag => tag.startsWith("wcag")).join(", ")}</p>
      <a className="font-semibold text-sky-700 underline" href={rule.helpUrl} target="_blank" rel="noreferrer">WCAG guidance &amp; remediation ↗</a>
      <p className="font-semibold text-zinc-800">Retained examples ({rule.representativeNodes.length} of {rule.nodeCount})</p>
      {rule.representativeNodes.map((node, index) => <div className="min-w-0 space-y-2 border-l-2 border-zinc-200 pl-3" key={index}>
        <p className="break-words font-mono text-[0.68rem]">{node.selectors.map(selector => Array.isArray(selector) ? selector.join(" >>> ") : selector).join(", ")}</p>
        <p className="whitespace-pre-line break-words">{node.failureSummary}</p>
        {node.colorContrast ? <p>Contrast ratio: {node.colorContrast.contrastRatio ?? "Not retained"}; required: {node.colorContrast.requiredContrastRatio ?? "Not retained"}.</p> : null}
        <pre className="max-w-full overflow-x-auto rounded bg-zinc-50 p-2 text-[0.68rem]">{node.htmlSnippet}</pre>
      </div>)}
      <EvidenceTools correctionSteps={[rule.help]} evidenceJson={{ accessibilityRule: rule }} />
    </div>
  </details>;
}

export function AccessibilityEvidence({ audit, observation }: Props) {
  return <details id="accessibility-evidence" className="group/accessibility border-b border-r border-zinc-200 p-5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0"><p className="text-xs font-semibold uppercase text-zinc-500">{ACCESSIBILITY_REPORT_LABEL} · Starting page</p>
        <h3 className={`mt-1 ${reportCardTitle}`}>{accessibilityIssueCountLabel(audit)}{audit.affectedNodeCount !== null ? ` · ${audit.affectedNodeCount} element instances` : ""}</h3></div>
      <span className="flex shrink-0 items-center gap-2">
        {audit.failedRuleCount !== null && audit.failedRuleCount > 0 ? <EvidenceStatusBadge label="Flagged" tone="concern" />
          : audit.reviewRuleCount ? <EvidenceStatusBadge label="Review" tone="review" /> : null}
        <DisclosureChevron className="text-zinc-400 group-open/accessibility:rotate-180" />
      </span>
    </summary>
    <div className="mt-5 space-y-3 text-xs leading-5 text-zinc-600">
      <p>WCAG 2.2 A/AA automated checks on the starting page.</p>
      <p>{audit.engine}{audit.engineVersion ? ` ${audit.engineVersion}` : ""}{observation?.rulesEvaluated.length ? ` · ${observation.rulesEvaluated.length} rules evaluated` : ""}</p>
      {audit.status !== "completed" ? <p className="text-amber-800">{audit.failedRuleCount === null ? "The audit did not return evaluable results." : `Coverage is limited${audit.reviewRuleCount ? `: ${audit.reviewRuleCount} ${audit.reviewRuleCount === 1 ? "check needs" : "checks need"} manual review` : ""}.`}</p> : null}
      {audit.failedRuleCount === 0 ? <p>No failures detected in the evaluated checks.</p> : null}
      {audit.failedRuleCount !== null && audit.failedRuleCount > 0 && !observation?.violations.length ? <p>Detailed examples are unavailable.</p> : null}
    </div>
    <div className="mt-4 divide-y divide-zinc-200 border-t border-zinc-200">
      {observation?.violations.map(rule => <RuleEvidence key={rule.ruleId} rule={rule} />)}
    </div>
    {observation?.reviewItems.length ? <div className="mt-4"><p className="text-xs font-semibold text-zinc-800">Checks needing manual review</p>
      <div className="mt-2 divide-y divide-zinc-200 border-t border-zinc-200">{observation.reviewItems.map(rule => <RuleEvidence key={rule.ruleId} rule={rule} review />)}</div>
    </div> : null}
  </details>;
}
