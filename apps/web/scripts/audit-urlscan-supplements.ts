import { writeFileSync } from "node:fs";
import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";
import { getFullScanUrlscanSupplement, shouldAttemptFullScanUrlscanSupplement } from "../server/scans/urlscan-supplement";

type BlockedScanRow = {
  scan_id: string;
  scan_timestamp: Date | string | null;
  created_at: Date | string | null;
  completed_at: Date | string | null;
  status: string | null;
  scan_type: string | null;
  hostname: string | null;
  domain: string | null;
  pages_scanned: number | null;
  verified_public_surfaces_count: number | null;
  coverage_level: string | null;
  scan_outcome: string | null;
  homepage_fetch_status: string | null;
  homepage_fetch_http_status: number | null;
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  auth_wall_detected: boolean | null;
  auth_wall_suspected: boolean | null;
  challenge_suspected: boolean | null;
};

type AuditBucket = "same_host" | "off_domain_redirect" | "no_supplement" | "not_attempted" | "error";

type AuditRow = {
  bucket: AuditBucket;
  completedAt: string | null;
  coverageLevel: string | null;
  finalHostname: string | null;
  homepageStatus: number | string | null;
  hostname: string | null;
  pagesScanned: number | null;
  reason: string;
  reportUrl: string | null;
  requestCount: number | null;
  scanId: string;
  scanOutcome: string | null;
  scanUrl: string;
  verifiedPublicSurfacesCount: number | null;
};

type HostSupplementClassification = Pick<AuditRow, "bucket" | "finalHostname" | "reason" | "reportUrl" | "requestCount">;

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getNumberArg(flag: string, fallback: number) {
  const raw = getArgValue(flag);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDate(value: Date | string | null) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" ? value : null;
}

function normalizeHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0]?.toLowerCase() || null;
  }
}

function getHomepageStatus(row: BlockedScanRow) {
  return row.homepage_fetch_http_status ?? row.homepage_fetch_status ?? null;
}

function buildSnapshot(row: BlockedScanRow): Record<string, unknown> {
  return {
    auth_wall_detected: row.auth_wall_detected,
    auth_wall_suspected: row.auth_wall_suspected,
    blocked_flag: row.blocked_flag,
    captcha_flag: row.captcha_flag,
    challenge_suspected: row.challenge_suspected,
    coverage_level: row.coverage_level,
    homepage_fetch_http_status: row.homepage_fetch_http_status,
    homepage_fetch_status: row.homepage_fetch_status,
    pages_scanned: row.pages_scanned,
    scan_outcome: row.scan_outcome,
    verified_public_surfaces_count: row.verified_public_surfaces_count
  };
}

async function loadBlockedScans(input: { hours: number; limit: number }) {
  const domainFilter = normalizeHostname(getArgValue("--domain"));
  const scanIdFilter = getArgValue("--scan-id");
  const since = new Date(Date.now() - input.hours * 60 * 60 * 1000).toISOString();
  const params: unknown[] = [];
  const scanScopeClause = scanIdFilter
    ? `s.id = $${params.push(scanIdFilter)}::uuid`
    : `ss.scan_timestamp >= $${params.push(since)}`;
  const domainClause = domainFilter
    ? `and lower(coalesce(d.hostname, ss.domain)) = $${params.push(domainFilter)}`
    : "";
  const limitParam = params.push(input.limit);
  const result = await query<BlockedScanRow>(
    `
      select
        ss.scan_id,
        ss.scan_timestamp,
        s.created_at,
        s.completed_at,
        s.status,
        s.scan_type,
        d.hostname,
        ss.domain,
        ss.pages_scanned,
        ss.verified_public_surfaces_count,
        ss.coverage_level,
        ss.scan_outcome,
        ss.homepage_fetch_status,
        ss.homepage_fetch_http_status,
        ss.blocked_flag,
        ss.captcha_flag,
        ss.auth_wall_detected,
        ss.auth_wall_suspected,
        ss.challenge_suspected
      from scan_snapshots ss
      join scans s on s.id = ss.scan_id
      left join domains d on d.id = ss.domain_id
      where ${scanScopeClause}
        and s.scan_type = 'full'
        and s.status = 'completed'
        ${domainClause}
        and (
          ss.blocked_flag = true
          or ss.captcha_flag = true
          or ss.auth_wall_detected = true
          or ss.auth_wall_suspected = true
          or ss.challenge_suspected = true
          or ss.homepage_fetch_status in ('blocked', 'forbidden')
          or ss.homepage_fetch_http_status in (401, 403)
          or ss.scan_outcome ~* '(blocked|captcha|auth|challenge|forbidden)'
          or (ss.coverage_level = 'limited_partial' and ss.pages_scanned = 0)
        )
      order by ss.scan_timestamp desc
      limit $${limitParam}
    `,
    params,
    { readOnly: true }
  );

  return result.rows;
}

function summarize(rows: AuditRow[]) {
  const buckets: Record<AuditBucket, number> = {
    error: 0,
    no_supplement: 0,
    not_attempted: 0,
    off_domain_redirect: 0,
    same_host: 0
  };

  for (const row of rows) {
    buckets[row.bucket] += 1;
  }

  return buckets;
}

function printTable(rows: AuditRow[]) {
  const printable = rows.map((row) => ({
    bucket: row.bucket,
    host: row.hostname,
    final: row.finalHostname ?? "",
    status: row.homepageStatus ?? "",
    pages: row.pagesScanned ?? "",
    verified: row.verifiedPublicSurfacesCount ?? "",
    requests: row.requestCount ?? "",
    scan: row.scanUrl,
    report: row.reportUrl ?? ""
  }));
  console.table(printable);
}

async function classifyHostSupplement(input: {
  hostname: string | null;
  snapshot: Record<string, unknown>;
}): Promise<HostSupplementClassification> {
  if (!shouldAttemptFullScanUrlscanSupplement({ snapshot: input.snapshot })) {
    return {
      bucket: "not_attempted",
      finalHostname: null,
      reason: "scan did not meet urlscan supplement gate",
      reportUrl: null,
      requestCount: null
    };
  }

  try {
    const payload = await getFullScanUrlscanSupplement({
      domainHostname: input.hostname,
      snapshot: input.snapshot
    });

    if (!payload?.fallbackEvidence) {
      return {
        bucket: "no_supplement",
        finalHostname: null,
        reason: "no rich same-host or submitted-domain urlscan evidence selected",
        reportUrl: null,
        requestCount: null
      };
    }

    return {
      bucket: payload.evidence?.urlscanEvidenceRelation === "off_domain_redirect"
        ? "off_domain_redirect"
        : "same_host",
      finalHostname: payload.evidence?.urlscanFinalHostname ?? null,
      reason: payload.resultState?.message ?? "urlscan supplement selected",
      reportUrl: payload.fallbackEvidence.reportUrl ?? null,
      requestCount: payload.fallbackEvidence.metrics?.requestCount ?? null
    };
  } catch (error) {
    return {
      bucket: "error",
      finalHostname: null,
      reason: error instanceof Error ? error.message : "unknown error",
      reportUrl: null,
      requestCount: null
    };
  }
}

async function auditRow(row: BlockedScanRow, hostCache: Map<string, Promise<HostSupplementClassification>>): Promise<AuditRow> {
  const hostname = normalizeHostname(row.hostname ?? row.domain);
  const snapshot = buildSnapshot(row);
  const base: Omit<AuditRow, "bucket" | "reason" | "reportUrl" | "requestCount" | "finalHostname"> = {
    completedAt: normalizeDate(row.completed_at ?? row.scan_timestamp ?? row.created_at),
    coverageLevel: row.coverage_level,
    homepageStatus: getHomepageStatus(row),
    hostname,
    pagesScanned: row.pages_scanned,
    scanId: row.scan_id,
    scanOutcome: row.scan_outcome,
    scanUrl: `https://certscore.ai/scan/${row.scan_id}`,
    verifiedPublicSurfacesCount: row.verified_public_surfaces_count
  };

  const cacheKey = hostname ?? `scan:${row.scan_id}`;
  if (!hostCache.has(cacheKey)) {
    hostCache.set(cacheKey, classifyHostSupplement({ hostname, snapshot }));
  }

  const classification = await hostCache.get(cacheKey) as HostSupplementClassification;
  return {
    ...base,
    ...classification
  };
}

async function main() {
  const hours = getNumberArg("--hours", 72);
  const limit = getNumberArg("--limit", 25);
  const domain = normalizeHostname(getArgValue("--domain"));
  const scanId = getArgValue("--scan-id");
  const outPath = getArgValue("--out");
  const jsonOnly = hasFlag("--json");

  const scans = await loadBlockedScans({ hours, limit });
  const rows: AuditRow[] = [];
  const hostCache = new Map<string, Promise<HostSupplementClassification>>();

  for (const scan of scans) {
    rows.push(await auditRow(scan, hostCache));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      hours,
      limit,
      domain,
      uniqueHostsChecked: hostCache.size,
      scanId,
      scannedRows: rows.length
    },
    summary: summarize(rows),
    rows
  };

  if (outPath) {
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("urlscan supplement audit");
    console.log(`scope: last ${hours}h, limit ${limit}`);
    console.log(report.summary);
    printTable(rows);
    if (outPath) {
      console.log(`wrote ${outPath}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
