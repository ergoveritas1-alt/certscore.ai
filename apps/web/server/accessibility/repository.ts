"use server";

import { query } from "@website-signal-risk-scanner/db";

export type AccessibilityOverviewScanRow = {
  completed_at: string | null;
  domain_id: string | null;
  id: string;
};

export type AccessibilityOverviewDomainRow = {
  hostname: string;
  id: string;
};

export type AccessibilityOverviewSnapshotRow = {
  accessibility_claim_mismatch_detected: boolean | null;
  accessibility_contact_method_present: boolean | null;
  accessibility_litigation_risk_score: number | null;
  accessibility_score: number | null;
  accessibility_statement_present: boolean | null;
  scan_id: string;
  vpat_or_accessibility_conformance_doc_present: boolean | null;
  wcag_aria_error_count: number | null;
  wcag_contrast_failures_count: number | null;
  wcag_error_count_total: number | null;
  wcag_keyboard_navigation_issue_count: number | null;
  wcag_missing_alt_count: number | null;
};

export async function loadAccessibilityOverviewCompletedScans(organizationId: string): Promise<AccessibilityOverviewScanRow[]> {
  try {
    const result = await query<AccessibilityOverviewScanRow>(
      `select id, domain_id, completed_at
         from scans
        where organization_id = $1
          and status = 'completed'
          and completed_at is not null
        order by completed_at desc
        limit 500`,
      [organizationId],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load accessibility scans: ${message}`);
  }
}

export type AccessibilityScanSummaryRow = {
  accessibility_score: number;
  automated_coverage_note: string;
  benchmark_label: string | null;
  created_at: string;
  critical_count: number;
  id: string;
  minor_count: number;
  moderate_count: number;
  page_url: string;
  risk_band: string;
  scan_id: string;
  serious_count: number;
  top_rule_families: unknown;
  total_affected_node_count: number;
  total_violation_count: number;
  wcag_criteria_impacted: unknown;
};

export type AccessibilityFindingRow = {
  affected_node_count: number;
  axe_impact: string;
  axe_rule_id: string;
  confidence: string;
  created_at: string;
  evidence_summary: string;
  finding_id: string;
  id: string;
  label: string;
  page_url: string;
  remediation: string;
  scan_id: string;
  severity: string;
  wcag: unknown;
};

export async function loadAccessibilityScanSummary(scanId: string): Promise<AccessibilityScanSummaryRow | null> {
  try {
    const result = await query<AccessibilityScanSummaryRow>(
      `select id, scan_id, page_url, accessibility_score, risk_band, total_violation_count,
              total_affected_node_count, critical_count, serious_count, moderate_count, minor_count,
              wcag_criteria_impacted, top_rule_families, benchmark_label, automated_coverage_note, created_at
         from accessibility_scan_summary
        where scan_id = $1
        order by created_at desc
        limit 1`,
      [scanId],
      { readOnly: true }
    );
    return result.rows[0] ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load accessibility scan summary: ${message}`);
  }
}

export async function loadAccessibilityFindings(scanId: string): Promise<AccessibilityFindingRow[]> {
  try {
    const result = await query<AccessibilityFindingRow>(
      `select id, scan_id, page_url, finding_id, label, severity, confidence, axe_rule_id, axe_impact,
              wcag, affected_node_count, evidence_summary, remediation, created_at
         from accessibility_findings
        where scan_id = $1
        order by
          case severity
            when 'critical' then 1
            when 'high' then 2
            when 'medium' then 3
            when 'low' then 4
            else 5
          end,
          affected_node_count desc`,
      [scanId],
      { readOnly: true }
    );
    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load accessibility findings: ${message}`);
  }
}

export async function loadAccessibilityScanSummaries(scanIds: string[]): Promise<AccessibilityScanSummaryRow[]> {
  if (scanIds.length === 0) {
    return [];
  }

  try {
    const result = await query<AccessibilityScanSummaryRow>(
      `select id, scan_id, page_url, accessibility_score, risk_band, total_violation_count,
              total_affected_node_count, critical_count, serious_count, moderate_count, minor_count,
              wcag_criteria_impacted, top_rule_families, benchmark_label, automated_coverage_note, created_at
         from accessibility_scan_summary
        where scan_id = any($1::uuid[])
        order by created_at desc`,
      [scanIds],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load accessibility scan summaries: ${message}`);
  }
}

export async function loadAccessibilityOverviewDomainsAndSnapshots(input: {
  domainIds: string[];
  organizationId: string;
  scanIds: string[];
}): Promise<{
  domains: AccessibilityOverviewDomainRow[];
  snapshots: AccessibilityOverviewSnapshotRow[];
}> {
  try {
    const [domainsResult, snapshotsResult] = await Promise.all([
      input.domainIds.length
        ? query<AccessibilityOverviewDomainRow>(
            `select id, hostname
               from domains
              where organization_id = $1
                and id = any($2::uuid[])`,
            [input.organizationId, input.domainIds],
            { readOnly: true }
          )
        : Promise.resolve({ rows: [] as AccessibilityOverviewDomainRow[] }),
      input.scanIds.length
        ? query<AccessibilityOverviewSnapshotRow>(
            `select scan_id, accessibility_score, accessibility_litigation_risk_score, accessibility_statement_present,
                    vpat_or_accessibility_conformance_doc_present, accessibility_contact_method_present,
                    accessibility_claim_mismatch_detected, wcag_error_count_total, wcag_missing_alt_count,
                    wcag_contrast_failures_count, wcag_aria_error_count, wcag_keyboard_navigation_issue_count
               from scan_snapshots
              where scan_id = any($1::uuid[])`,
            [input.scanIds],
            { readOnly: true }
          )
        : Promise.resolve({ rows: [] as AccessibilityOverviewSnapshotRow[] })
    ]);

    return {
      domains: domainsResult.rows,
      snapshots: snapshotsResult.rows
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    if (input.domainIds.length && input.scanIds.length) {
      throw new Error(`Failed to load accessibility overview data: ${message}`);
    }
    if (input.domainIds.length) {
      throw new Error(`Failed to load accessibility domains: ${message}`);
    }
    throw new Error(`Failed to load accessibility snapshots: ${message}`);
  }
}
