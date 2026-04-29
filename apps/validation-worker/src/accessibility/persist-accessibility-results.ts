import { query } from "@website-signal-risk-scanner/db";
import type { AccessibilityScanResult } from "@website-signal-risk-scanner/shared";

/**
 * Persist accessibility scan results into the canonical tables.
 *
 * Writes to both:
 * - accessibility_scan_summary / accessibility_findings (new tables)
 * - scan_accessibility_rule_examples (existing table, for backward compatibility
 *   with the normalized-concerns -> unified-findings pipeline)
 */

export async function persistAccessibilityResults(
  scanId: string,
  organizationId: string,
  domainId: string,
  result: AccessibilityScanResult
): Promise<void> {
  await persistToNewTables(scanId, result);
  await persistToLegacyTable(scanId, organizationId, domainId, result);
}

async function persistToNewTables(scanId: string, result: AccessibilityScanResult): Promise<void> {
  await query(
    `insert into accessibility_scan_summary (
       scan_id, page_url, accessibility_score, risk_band,
       total_violation_count, total_affected_node_count,
       critical_count, serious_count, moderate_count, minor_count,
       wcag_criteria_impacted, top_rule_families, benchmark_label,
       automated_coverage_note
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      scanId,
      result.pageUrl,
      result.metrics.accessibilityScore,
      result.score.band,
      result.metrics.totalViolationCount,
      result.metrics.totalAffectedNodeCount,
      result.metrics.criticalCount,
      result.metrics.seriousCount,
      result.metrics.moderateCount,
      result.metrics.minorCount,
      JSON.stringify(result.metrics.wcagCriteriaImpacted),
      JSON.stringify(result.metrics.topRuleFamilies),
      result.benchmarkLabel,
      result.metrics.automatedCoverageNote
    ]
  );

  for (const finding of result.findings) {
    await query(
      `insert into accessibility_findings (
         scan_id, page_url, finding_id, label, severity, confidence,
         axe_rule_id, axe_impact, wcag, affected_node_count,
         evidence_summary, remediation, benchmark
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        scanId,
        finding.pageUrl,
        finding.id,
        finding.label,
        finding.severity,
        finding.confidence,
        finding.axeRuleId,
        finding.axeImpact,
        JSON.stringify(finding.wcag),
        finding.affectedNodeCount,
        finding.evidenceSummary,
        finding.remediation,
        finding.benchmark ? JSON.stringify(finding.benchmark) : null
      ]
    );
  }
}

async function persistToLegacyTable(
  scanId: string,
  organizationId: string,
  domainId: string,
  result: AccessibilityScanResult
): Promise<void> {
  for (const finding of result.findings) {
    await query(
      `insert into scan_accessibility_rule_examples (
         scan_id, organization_id, domain_id, page_url,
         rule_code, rule_group, severity, impact,
         help, help_url, description, node_count,
         representative_selectors
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        scanId,
        organizationId,
        domainId,
        finding.pageUrl,
        finding.axeRuleId,
        finding.wcag[0] ?? "wcag2a",
        finding.severity,
        finding.axeImpact,
        finding.label,
        finding.helpUrl,
        finding.evidenceSummary,
        finding.affectedNodeCount,
        JSON.stringify(finding.representativeSelectors)
      ]
    );
  }
}
