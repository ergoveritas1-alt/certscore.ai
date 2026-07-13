import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonObject = Record<string, unknown>;

type Finding = {
  confidence: string;
  criticality: string;
  exampleCount: number;
  hasConsentContext: boolean;
  hasPolicyAnchor: boolean;
  hasTimingAnchor: boolean;
  hasVendorAnchor: boolean;
  id: string;
  label: string;
  projectionWarnings: string[];
};

type Scan = {
  checklistFingerprint: string;
  completedAt: string | null;
  consentSurfaceObserved: boolean | null;
  cookieCount: number;
  coverageKeys: string[];
  domain: string;
  evidenceFingerprint: string;
  file: string;
  findings: Finding[];
  hasVisualNoGo: boolean;
  limitedCoverage: boolean;
  policySurfaceCount: number;
  projectedFindingsTruncated: boolean;
  projectionVersion: string;
  scanId: string;
  scanStatus: string;
  schemaVersion: string;
  structuredPreConsentTrackerEvidence: boolean;
  substantiveFindingsWithoutNoGoWarning: string[];
  trackerCount: number;
};

type ReviewRow = {
  detail: string;
  domain: string;
  findingId: string;
  priority: "high" | "medium" | "low";
  scanId: string;
  type: string;
};

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getPath(root: unknown, keys: string[]): unknown {
  let current = root;
  for (const key of keys) {
    const row = asObject(current);
    if (!row) return undefined;
    current = row[key];
  }
  return current;
}

function items(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const row = asObject(value);
  return Array.isArray(row?.items) ? row.items : [];
}

function cappedTotal(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  const row = asObject(value);
  const cap = asObject(row?.cap);
  return asNumber(cap?.total, items(value).length);
}

function capIsTruncated(value: unknown): boolean {
  const row = asObject(value);
  const cap = asObject(row?.cap);
  return cap?.truncated === true || asNumber(cap?.shown, 0) < asNumber(cap?.total, 0);
}

function normalizeDomain(value: unknown): string {
  const raw = asString(value).trim().toLowerCase();
  if (!raw) return "unknown";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").replace(/\/$/, "");
  }
}

function isoOrNull(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function countBucket(count: number): string {
  if (count === 0) return "0";
  if (count <= 3) return "1-3";
  if (count <= 10) return "4-10";
  return "11+";
}

function normalizedKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

function findBooleanByKey(value: unknown, keys: Set<string>, depth = 0): boolean | null {
  if (depth > 7 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = findBooleanByKey(entry, keys, depth + 1);
      if (match !== null) return match;
    }
    return null;
  }
  const row = asObject(value);
  if (!row) return null;
  for (const [key, entry] of Object.entries(row)) {
    if (keys.has(key) && typeof entry === "boolean") return entry;
  }
  for (const entry of Object.values(row)) {
    const match = findBooleanByKey(entry, keys, depth + 1);
    if (match !== null) return match;
  }
  return null;
}

function hasStructuredPreConsentRow(value: unknown, depth = 0): boolean {
  if (depth > 7 || value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((entry) => hasStructuredPreConsentRow(entry, depth + 1));
  const row = asObject(value);
  if (!row) return false;
  const phase = asString(row.phase ?? row.observedPhase).toLowerCase();
  const category = normalizedKey(asString(row.category ?? row.vendorCategory));
  const relevantCategory = new Set([
    "advertising",
    "analytics",
    "fingerprinting",
    "marketing",
    "session_recording",
    "session_replay",
    "tracking",
  ]).has(category);
  if (
    relevantCategory &&
    (row.preConsent === true || phase.includes("pre_consent") || phase.includes("before_consent"))
  ) {
    return true;
  }
  return Object.values(row).some((entry) => hasStructuredPreConsentRow(entry, depth + 1));
}

function parseFinding(value: unknown): Finding | null {
  const row = asObject(value);
  const id = asString(row?.id);
  if (!row || !id) return null;
  const digest = asObject(row.evidenceDigest);
  return {
    confidence: asString(row.confidence, "unknown"),
    criticality: asString(row.criticality, "unknown"),
    exampleCount: asNumber(digest?.exampleCount, 0),
    hasConsentContext: digest?.hasConsentContext === true,
    hasPolicyAnchor: digest?.hasPolicyAnchor === true,
    hasTimingAnchor: digest?.hasTimingAnchor === true,
    hasVendorAnchor: digest?.hasVendorAnchor === true,
    id,
    label: asString(row.label, id),
    projectionWarnings: Array.isArray(digest?.projectionWarnings)
      ? digest.projectionWarnings.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

function checklistFingerprint(value: unknown): string {
  return items(value)
    .map((entry) => {
      const row = asObject(entry);
      if (!row) return null;
      const id = asString(row.id ?? row.key ?? row.checkId ?? row.label);
      const status = asString(row.status ?? row.result ?? row.evidenceState);
      return id ? `${id}:${status}` : null;
    })
    .filter((entry): entry is string => Boolean(entry))
    .sort()
    .join("|");
}

function parseScan(file: string, report: JsonObject): Scan | null {
  const scanId = asString(report.scanId ?? report.scan_id);
  const domain = normalizeDomain(report.domain);
  if (!scanId || domain === "unknown") return null;

  const projected = report.projectedFindings;
  const findings = items(projected)
    .map(parseFinding)
    .filter((entry): entry is Finding => entry !== null);
  const hasVisualNoGo = findings.some((finding) => finding.id === "scan_quality_visual_no_go");
  const substantiveFindingsWithoutNoGoWarning = findings
    .filter(
      (finding) =>
        finding.id !== "scan_quality_visual_no_go" &&
        !finding.projectionWarnings.includes("coverage_limited_by_scan_quality_no_go"),
    )
    .map((finding) => finding.id);
  const checklist = report.gdprEprivacyChecklistRows;
  const trackerCount = cappedTotal(report.trackerRows ?? report.trackerVendorInventory);
  const cookieCount = cappedTotal(report.cookieStorageInventory);
  const policySurfaceCount = cappedTotal(report.policySurfaceCoverage);
  const interruptions = items(getPath(report, ["coverageDiagnostics", "interruptions"]));
  const machineLimited = getPath(report, ["summary", "machineSummary", "limitedCoverage"]) === true;
  const limitedCoverage = machineLimited || interruptions.length > 0;
  const scanStatus = asString(report.scanStatus, "unknown");
  const consentSurfaceObserved = findBooleanByKey(
    report.consentSurfaceEvidence,
    new Set(["bannerSeen", "consentSurfaceObserved", "consentBannerSeen", "surfaceObserved"]),
  );
  const coverageKeys = new Set<string>();

  if (scanStatus !== "completed") coverageKeys.add(`scan_status:${normalizedKey(scanStatus)}`);
  if (limitedCoverage) coverageKeys.add("limited_coverage");
  for (const interruption of interruptions) {
    const row = asObject(interruption);
    const label = normalizedKey(asString(row?.label ?? row?.reviewTitle));
    if (label) coverageKeys.add(`interruption:${label}`);
  }
  const accessPostureClass = normalizedKey(asString(getPath(report, ["coverageDiagnostics", "accessPosture", "accessPostureClass"])));
  if (accessPostureClass) coverageKeys.add(`access_posture:${accessPostureClass}`);
  const warnings = items(getPath(report, ["projectionDiagnostics", "projectionWarnings"]));
  for (const warning of warnings) {
    if (typeof warning === "string" && warning) coverageKeys.add(`projection_warning:${normalizedKey(warning)}`);
  }
  if (capIsTruncated(projected)) coverageKeys.add("export_truncated:projected_findings");
  if (capIsTruncated(checklist)) coverageKeys.add("export_truncated:checklist");
  if (hasVisualNoGo) coverageKeys.add("finding:scan_quality_visual_no_go");

  const checklistPrint = checklistFingerprint(checklist);
  const evidenceFingerprint = [
    `trackers=${countBucket(trackerCount)}`,
    `cookies=${countBucket(cookieCount)}`,
    `policies=${countBucket(policySurfaceCount)}`,
    `consent=${String(consentSurfaceObserved)}`,
    `limited=${String(limitedCoverage)}`,
    `status=${scanStatus}`,
    `checklist=${checklistPrint}`,
  ].join(";");

  return {
    checklistFingerprint: checklistPrint,
    completedAt:
      isoOrNull(getPath(report, ["timestamps", "completedAt"])) ??
      isoOrNull(getPath(report, ["timestamps", "createdAt"])) ??
      isoOrNull(getPath(report, ["meta", "generatedAt"])),
    consentSurfaceObserved,
    cookieCount,
    coverageKeys: [...coverageKeys].sort(),
    domain,
    evidenceFingerprint,
    file,
    findings,
    hasVisualNoGo,
    limitedCoverage,
    policySurfaceCount,
    projectedFindingsTruncated: capIsTruncated(projected),
    projectionVersion: asString(getPath(report, ["meta", "projectionVersion"]), "missing"),
    scanId,
    scanStatus,
    schemaVersion: asString(getPath(report, ["meta", "schemaVersion"]), "missing"),
    structuredPreConsentTrackerEvidence: hasStructuredPreConsentRow(report.trackerRows),
    substantiveFindingsWithoutNoGoWarning,
    trackerCount,
  };
}

function csv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: unknown) => {
    const raw = Array.isArray(value) ? value.join("|") : String(value ?? "");
    return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
  };
  return `${headers.map(escape).join(",")}\n${rows.map((row) => headers.map((header) => escape(row[header])).join(",")).join("\n")}\n`;
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2));
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function setDifference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

function findingIds(scan: Scan): Set<string> {
  return new Set(scan.findings.map((finding) => finding.id));
}

function elapsedHours(before: Scan, after: Scan): number | null {
  if (!before.completedAt || !after.completedAt) return null;
  return Number(((Date.parse(after.completedAt) - Date.parse(before.completedAt)) / 3_600_000).toFixed(2));
}

export async function analyzePublicEvidenceCorpus(inputDir: string, outDir: string): Promise<JsonObject> {
  const names = (await readdir(inputDir)).filter((name) => name.endsWith(".json")).sort();
  const parsed: Scan[] = [];
  const parseFailures: Array<{ error: string; file: string }> = [];
  let ignoredJsonFiles = 0;

  for (const name of names) {
    const file = path.join(inputDir, name);
    try {
      const report = JSON.parse(await readFile(file, "utf8")) as JsonObject;
      const scan = parseScan(file, report);
      if (scan) parsed.push(scan);
      else ignoredJsonFiles += 1;
    } catch (error) {
      parseFailures.push({ error: error instanceof Error ? error.message : String(error), file });
    }
  }

  const scansById = new Map<string, Scan>();
  for (const scan of parsed) {
    const current = scansById.get(scan.scanId);
    if (!current || (scan.completedAt ?? "") > (current.completedAt ?? "")) scansById.set(scan.scanId, scan);
  }
  const scans = [...scansById.values()].sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
  const byDomain = new Map<string, Scan[]>();
  for (const scan of scans) {
    const bucket = byDomain.get(scan.domain) ?? [];
    bucket.push(scan);
    byDomain.set(scan.domain, bucket);
  }

  const findingScanCounts = new Map<string, number>();
  const findingLabels = new Map<string, string>();
  const findingTransitionOpportunities = new Map<string, number>();
  const findingFlipCounts = new Map<string, number>();
  const findingSameEvidenceFlipCounts = new Map<string, number>();
  const findingUnsupportedCounts = new Map<string, number>();
  const comparisons: Array<Record<string, unknown>> = [];
  const flips: Array<Record<string, unknown>> = [];
  const reviewQueue: ReviewRow[] = [];

  for (const scan of scans) {
    for (const finding of scan.findings) {
      increment(findingScanCounts, finding.id);
      findingLabels.set(finding.id, finding.label);
      const hasAnchor =
        finding.exampleCount > 0 ||
        finding.hasConsentContext ||
        finding.hasPolicyAnchor ||
        finding.hasTimingAnchor ||
        finding.hasVendorAnchor;
      if (!hasAnchor) {
        increment(findingUnsupportedCounts, finding.id);
        reviewQueue.push({
          detail: "Projected finding has no examples or structured timing, vendor, consent, or policy anchor in the public evidence export.",
          domain: scan.domain,
          findingId: finding.id,
          priority: finding.id.startsWith("regulatory_gap__") ? "low" : "medium",
          scanId: scan.scanId,
          type: "finding_without_structured_anchor",
        });
      }
      if (finding.id.includes("tracking") && finding.exampleCount === 0 && !finding.hasTimingAnchor && !finding.hasVendorAnchor) {
        reviewQueue.push({
          detail: "Tracking-related finding lacks an exported request example, timing anchor, and vendor anchor.",
          domain: scan.domain,
          findingId: finding.id,
          priority: "high",
          scanId: scan.scanId,
          type: "tracking_finding_without_runtime_anchor",
        });
      }
      if (
        /(policy|privacy_disclosure|transparency)/.test(finding.id) &&
        scan.policySurfaceCount === 0 &&
        !finding.hasPolicyAnchor
      ) {
        reviewQueue.push({
          detail: "Absence-based policy/disclosure finding has no retained policy surface or exported policy-discovery anchor; verify that discovery coverage was sufficient before relying on the absence.",
          domain: scan.domain,
          findingId: finding.id,
          priority: "medium",
          scanId: scan.scanId,
          type: "absence_finding_without_policy_discovery_anchor",
        });
      }
    }
    if (
      scan.structuredPreConsentTrackerEvidence &&
      !scan.findings.some((finding) => finding.id === "pre_consent_tracking_detected")
    ) {
      reviewQueue.push({
        detail: "Structured pre-consent advertising/analytics tracker evidence is retained, but the unified pre_consent_tracking_detected finding is absent; verify promotion-grade request lineage and policy gating.",
        domain: scan.domain,
        findingId: "pre_consent_tracking_detected",
        priority: "high",
        scanId: scan.scanId,
        type: "preconsent_tracker_evidence_without_unified_finding",
      });
    }
    if (scan.hasVisualNoGo && scan.scanStatus === "completed") {
      reviewQueue.push({
        detail: "The report is marked completed while also projecting scan_quality_visual_no_go; verify the retained screenshot and no-go classifier.",
        domain: scan.domain,
        findingId: "scan_quality_visual_no_go",
        priority: "high",
        scanId: scan.scanId,
        type: "visual_no_go_with_completed_status",
      });
    }
    if (scan.hasVisualNoGo && scan.substantiveFindingsWithoutNoGoWarning.length > 0) {
      reviewQueue.push({
        detail: `Visual no-go coexists with substantive findings that lack the no-go coverage warning: ${scan.substantiveFindingsWithoutNoGoWarning.join(", ")}.`,
        domain: scan.domain,
        findingId: "scan_quality_visual_no_go",
        priority: "high",
        scanId: scan.scanId,
        type: "visual_no_go_with_undemoted_findings",
      });
    }
    if (scan.projectedFindingsTruncated) {
      reviewQueue.push({
        detail: "The projected-findings export is truncated; absence comparisons for this scan are incomplete.",
        domain: scan.domain,
        findingId: "",
        priority: "medium",
        scanId: scan.scanId,
        type: "truncated_finding_export",
      });
    }
  }

  let repeatComparisons = 0;
  let exactFindingSetComparisons = 0;
  let similarEvidenceComparisons = 0;
  let similarEvidenceFindingFlips = 0;
  for (const [domain, domainScans] of byDomain) {
    if (domainScans.length < 2) continue;
    domainScans.sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
    for (let index = 1; index < domainScans.length; index += 1) {
      const before = domainScans[index - 1];
      const after = domainScans[index];
      if (!before || !after) continue;
      repeatComparisons += 1;
      const beforeIds = findingIds(before);
      const afterIds = findingIds(after);
      const added = setDifference(afterIds, beforeIds);
      const removed = setDifference(beforeIds, afterIds);
      const exactAgreement = added.length === 0 && removed.length === 0;
      const similarEvidence = before.evidenceFingerprint === after.evidenceFingerprint;
      if (exactAgreement) exactFindingSetComparisons += 1;
      if (similarEvidence) similarEvidenceComparisons += 1;
      if (similarEvidence && !exactAgreement) similarEvidenceFindingFlips += 1;

      const union = new Set([...beforeIds, ...afterIds]);
      for (const id of union) {
        increment(findingTransitionOpportunities, id);
        if (beforeIds.has(id) !== afterIds.has(id)) {
          increment(findingFlipCounts, id);
          if (similarEvidence) increment(findingSameEvidenceFlipCounts, id);
        }
      }

      comparisons.push({
        addedFindingCount: added.length,
        addedFindingIds: added,
        afterCompletedAt: after.completedAt,
        afterFindingCount: after.findings.length,
        afterScanId: after.scanId,
        beforeCompletedAt: before.completedAt,
        beforeFindingCount: before.findings.length,
        beforeScanId: before.scanId,
        domain,
        elapsedHours: elapsedHours(before, after),
        exactFindingSetAgreement: exactAgreement,
        removedFindingCount: removed.length,
        removedFindingIds: removed,
        sameEvidenceFingerprint: similarEvidence,
        schemaChanged: before.schemaVersion !== after.schemaVersion,
      });

      for (const id of [...added, ...removed]) {
        const direction = added.includes(id) ? "appeared" : "disappeared";
        flips.push({
          afterScanId: after.scanId,
          beforeScanId: before.scanId,
          direction,
          domain,
          elapsedHours: elapsedHours(before, after),
          findingId: id,
          sameEvidenceFingerprint: similarEvidence,
          schemaChanged: before.schemaVersion !== after.schemaVersion,
        });
        if (similarEvidence) {
          reviewQueue.push({
            detail: `Finding ${direction} between adjacent scans despite an unchanged bounded evidence fingerprint.`,
            domain,
            findingId: id,
            priority: "high",
            scanId: after.scanId,
            type: "finding_flip_with_similar_evidence",
          });
        }
      }
    }
  }

  const prevalence = [...findingScanCounts]
    .map(([id, count]) => {
      const opportunities = findingTransitionOpportunities.get(id) ?? 0;
      const flipCount = findingFlipCounts.get(id) ?? 0;
      return {
        findingId: id,
        label: findingLabels.get(id) ?? id,
        scans: count,
        prevalencePercent: percentage(count, scans.length),
        repeatTransitionOpportunities: opportunities,
        repeatTransitionFlips: flipCount,
        repeatTransitionFlipRatePercent: percentage(flipCount, opportunities),
        sameEvidenceFlips: findingSameEvidenceFlipCounts.get(id) ?? 0,
        scansWithoutStructuredAnchor: findingUnsupportedCounts.get(id) ?? 0,
      };
    })
    .sort((a, b) => b.scans - a.scans || a.findingId.localeCompare(b.findingId));

  const coverageCounts = new Map<string, number>();
  const coverageFindingTotals = new Map<string, number>();
  const coverageComparisonTotals = new Map<string, number>();
  const coverageComparisonExact = new Map<string, number>();
  for (const scan of scans) {
    for (const key of scan.coverageKeys) {
      increment(coverageCounts, key);
      increment(coverageFindingTotals, key, scan.findings.length);
    }
  }
  const scanById = new Map(scans.map((scan) => [scan.scanId, scan]));
  for (const comparison of comparisons) {
    const before = scanById.get(asString(comparison.beforeScanId));
    const after = scanById.get(asString(comparison.afterScanId));
    if (!before || !after) continue;
    const keys = new Set([...before.coverageKeys, ...after.coverageKeys]);
    for (const key of keys) {
      increment(coverageComparisonTotals, key);
      if (comparison.exactFindingSetAgreement === true) increment(coverageComparisonExact, key);
    }
  }
  const coverageImpact = [...coverageCounts]
    .map(([key, count]) => ({
      averageProjectedFindings: Number(((coverageFindingTotals.get(key) ?? 0) / count).toFixed(2)),
      coverageKey: key,
      repeatComparisonExactAgreementPercent: percentage(
        coverageComparisonExact.get(key) ?? 0,
        coverageComparisonTotals.get(key) ?? 0,
      ),
      repeatComparisons: coverageComparisonTotals.get(key) ?? 0,
      scans: count,
      scanSharePercent: percentage(count, scans.length),
    }))
    .sort((a, b) => b.scans - a.scans || a.coverageKey.localeCompare(b.coverageKey));

  const schemaCounts = new Map<string, number>();
  const projectionCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  for (const scan of scans) {
    increment(schemaCounts, scan.schemaVersion);
    increment(projectionCounts, scan.projectionVersion);
    increment(statusCounts, scan.scanStatus);
  }

  const versionPrevalence: Array<Record<string, unknown>> = [];
  const findingIdsAcrossVersions = new Set(scans.flatMap((scan) => scan.findings.map((finding) => finding.id)));
  for (const findingId of findingIdsAcrossVersions) {
    const row: Record<string, unknown> = { findingId, label: findingLabels.get(findingId) ?? findingId };
    const rates: number[] = [];
    for (const [version, versionScanCount] of schemaCounts) {
      const count = scans.filter(
        (scan) => scan.schemaVersion === version && scan.findings.some((finding) => finding.id === findingId),
      ).length;
      const rate = percentage(count, versionScanCount);
      row[`schema_${version}_scans`] = count;
      row[`schema_${version}_prevalence_percent`] = rate;
      rates.push(rate);
    }
    row.maxPrevalenceDeltaPoints = Number((Math.max(...rates) - Math.min(...rates)).toFixed(2));
    versionPrevalence.push(row);
  }
  versionPrevalence.sort(
    (a, b) => asNumber(b.maxPrevalenceDeltaPoints) - asNumber(a.maxPrevalenceDeltaPoints),
  );

  reviewQueue.sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      a.type.localeCompare(b.type) ||
      a.domain.localeCompare(b.domain),
  );
  const reviewTypeCounts = new Map<string, number>();
  for (const row of reviewQueue) increment(reviewTypeCounts, `${row.priority}:${row.type}`);

  const summary = {
    reportVersion: "wc01.public_evidence_corpus_reliability_audit.1",
    generatedAt: new Date().toISOString(),
    guardrails: [
      "This is an offline diagnostic audit and does not create, upgrade, suppress, or persist findings.",
      "Review-queue rows are hypotheses requiring retained-evidence review, not legal or compliance conclusions.",
      "Production fixes must follow observed evidence -> normalized concern -> concern policy -> unified finding/checklist projection.",
    ],
    inventory: {
      duplicateReportFiles: parsed.length - scans.length,
      ignoredJsonFiles,
      inputJsonFiles: names.length,
      invalidJsonFiles: parseFailures.length,
      pairedScreenshotsNotInspected: true,
      parsedReportFiles: parsed.length,
      uniqueDomains: byDomain.size,
      uniqueScans: scans.length,
    },
    versions: {
      projectionVersions: Object.fromEntries([...projectionCounts].sort()),
      scanStatuses: Object.fromEntries([...statusCounts].sort()),
      schemaVersions: Object.fromEntries([...schemaCounts].sort()),
    },
    stability: {
      domainsWithRepeatScans: [...byDomain.values()].filter((entries) => entries.length > 1).length,
      exactFindingSetAgreementPercent: percentage(exactFindingSetComparisons, repeatComparisons),
      repeatComparisons,
      similarEvidenceComparisons,
      similarEvidenceFindingFlipComparisons: similarEvidenceFindingFlips,
      similarEvidenceFindingFlipPercent: percentage(similarEvidenceFindingFlips, similarEvidenceComparisons),
    },
    diagnostics: {
      scansMarkedLimitedCoverage: scans.filter((scan) => scan.limitedCoverage).length,
      limitedCoverageSharePercent: percentage(scans.filter((scan) => scan.limitedCoverage).length, scans.length),
      visualNoGoScans: scans.filter((scan) => scan.hasVisualNoGo).length,
      visualNoGoMarkedCompleted: scans.filter((scan) => scan.hasVisualNoGo && scan.scanStatus === "completed").length,
      visualNoGoWithOtherFindings: scans.filter((scan) => scan.hasVisualNoGo && scan.findings.length > 1).length,
      visualNoGoWithUndemotedFindings: scans.filter(
        (scan) => scan.hasVisualNoGo && scan.substantiveFindingsWithoutNoGoWarning.length > 0,
      ).length,
      preconsentTrackerEvidenceScans: scans.filter((scan) => scan.structuredPreConsentTrackerEvidence).length,
      preconsentTrackerEvidenceWithoutUnifiedFinding: scans.filter(
        (scan) =>
          scan.structuredPreConsentTrackerEvidence &&
          !scan.findings.some((finding) => finding.id === "pre_consent_tracking_detected"),
      ).length,
    },
    reviewQueue: {
      highPriority: reviewQueue.filter((row) => row.priority === "high").length,
      mediumPriority: reviewQueue.filter((row) => row.priority === "medium").length,
      lowPriority: reviewQueue.filter((row) => row.priority === "low").length,
      total: reviewQueue.length,
      types: Object.fromEntries([...reviewTypeCounts].sort()),
    },
    parseFailures,
  };

  const topUnstable = [...prevalence]
    .filter((row) => row.repeatTransitionFlips > 0)
    .sort(
      (a, b) =>
        b.sameEvidenceFlips - a.sameEvidenceFlips ||
        b.repeatTransitionFlipRatePercent - a.repeatTransitionFlipRatePercent ||
        b.repeatTransitionFlips - a.repeatTransitionFlips,
    )
    .slice(0, 20);
  const markdown = [
    "# Public evidence corpus reliability audit",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "## Inventory",
    "",
    `- ${summary.inventory.uniqueScans} unique scans across ${summary.inventory.uniqueDomains} domains from ${summary.inventory.inputJsonFiles} JSON files.`,
    `- ${summary.inventory.duplicateReportFiles} duplicate report files, ${summary.inventory.invalidJsonFiles} invalid JSON files, ${summary.inventory.ignoredJsonFiles} non-report JSON files.`,
    "- Screenshots were not used to create findings; they remain available for targeted manual QA.",
    "",
    "## Stability",
    "",
    `- ${summary.stability.domainsWithRepeatScans} domains have repeat scans, producing ${summary.stability.repeatComparisons} adjacent comparisons.`,
    `- Exact projected-finding-set agreement: ${summary.stability.exactFindingSetAgreementPercent}%.`,
    `- ${summary.stability.similarEvidenceFindingFlipComparisons} of ${summary.stability.similarEvidenceComparisons} comparisons with the same bounded evidence fingerprint changed findings (${summary.stability.similarEvidenceFindingFlipPercent}%).`,
    "",
    "## Reliability diagnostics",
    "",
    `- ${summary.diagnostics.scansMarkedLimitedCoverage} scans (${summary.diagnostics.limitedCoverageSharePercent}%) are marked limited coverage, so that flag currently provides no cohort separation.`,
    `- ${summary.diagnostics.visualNoGoScans} scans project scan_quality_visual_no_go; ${summary.diagnostics.visualNoGoMarkedCompleted} are nevertheless marked completed and ${summary.diagnostics.visualNoGoWithUndemotedFindings} retain substantive findings without the no-go warning.`,
    `- ${summary.diagnostics.preconsentTrackerEvidenceWithoutUnifiedFinding} of ${summary.diagnostics.preconsentTrackerEvidenceScans} scans with structured pre-consent advertising/analytics tracker rows do not project pre_consent_tracking_detected.`,
    "",
    "## Highest-priority unstable findings",
    "",
    "| Finding | Scans | Flip rate | Same-evidence flips |",
    "|---|---:|---:|---:|",
    ...topUnstable.map(
      (row) =>
        `| ${row.findingId} | ${row.scans} | ${row.repeatTransitionFlipRatePercent}% | ${row.sameEvidenceFlips} |`,
    ),
    "",
    "## Review queue",
    "",
    `- High priority: ${summary.reviewQueue.highPriority}`,
    `- Medium priority: ${summary.reviewQueue.mediumPriority}`,
    `- Low priority: ${summary.reviewQueue.lowPriority}`,
    "",
    "Review rows are diagnostic hypotheses only. Validate the retained evidence and trace any confirmed defect to the first broken pipeline stage before changing production behavior.",
    "",
  ].join("\n");

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`),
    writeFile(path.join(outDir, "README.md"), markdown),
    writeFile(path.join(outDir, "finding-prevalence.csv"), csv(prevalence)),
    writeFile(path.join(outDir, "repeat-scan-comparisons.csv"), csv(comparisons)),
    writeFile(path.join(outDir, "finding-flips.csv"), csv(flips)),
    writeFile(path.join(outDir, "coverage-impact.csv"), csv(coverageImpact)),
    writeFile(path.join(outDir, "review-queue.csv"), csv(reviewQueue)),
    writeFile(path.join(outDir, "schema-version-prevalence.csv"), csv(versionPrevalence)),
  ]);
  return summary;
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main(): Promise<void> {
  const inputDir = path.resolve(argValue("--input") ?? "/Volumes/miniben/CertScore/evidence");
  const stamp = new Date().toISOString().replace(/[:.]/g, "");
  const outDir = path.resolve(argValue("--out") ?? `artifacts/public-evidence-corpus-audit-${stamp}`);
  const summary = await analyzePublicEvidenceCorpus(inputDir, outDir);
  console.log(JSON.stringify({ outDir, summary }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
