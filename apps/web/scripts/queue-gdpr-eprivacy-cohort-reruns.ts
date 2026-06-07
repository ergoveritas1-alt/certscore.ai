import { lookup, resolve4, resolve6 } from "node:dns/promises";
import {
  FULL_SCAN_EVENT_TYPES,
  SCAN_EVENT_TYPES,
  getPlanDefinition,
  normalizeScanFrom,
  parseDomainBatchInput,
  type ScanFrom,
  type ScanProfile
} from "@website-signal-risk-scanner/shared";
import { closePools, query, queryOne } from "@website-signal-risk-scanner/db";
import { checkDomainDnsWithResolvers } from "../server/domains/domain-dns-core";
import { buildQueuedFullScanConfig } from "../server/scans/full-scan-config";

const DEFAULT_GDPR_EPRIVACY_RERUN_DOMAINS = [
  "https://www.target.com/",
  "https://www.sephora.com/",
  "https://www.chewy.com/",
  "https://www.goodrx.com/"
];

const DEFAULT_SOURCE = "gdpr-eprivacy-cohort-validation";
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_SCAN_FROM = "default";
const QUEUE_ORIGIN = "user";
const QUEUE_PRIORITY = 10;

type QueueCandidate = {
  domain: string;
  hostname: string;
  normalizedUrl: string;
};

type QueueResult = QueueCandidate & {
  error?: string;
  queued?: boolean;
  scanId?: string | null;
  skipped?: boolean;
  skipReason?: string;
};

type AnonymousDomainRow = {
  hostname: string;
  id: string;
  normalized_url: string;
  organization_id: string | null;
};

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getArgValue(flag: string) {
  const inlinePrefix = `${flag}=`;
  const inline = process.argv.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) {
    return inline.slice(inlinePrefix.length);
  }

  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function getListArg(flag: string) {
  const raw = getArgValue(flag);
  if (!raw) {
    return [];
  }

  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getPositiveIntegerArg(flag: string, fallback: number) {
  const value = Number(getArgValue(flag));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function getProfileArg(): ScanProfile {
  const raw = getArgValue("--profile");
  if (raw === "homepage" || raw === "standard" || raw === "team") {
    return raw;
  }

  return getPlanDefinition("free").scanProfile;
}

function getDatabaseHostForSafetyCheck() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null;
  if (databaseUrl) {
    try {
      return new URL(databaseUrl).hostname.toLowerCase();
    } catch {
      return "unparseable";
    }
  }

  return (process.env.PGHOST ?? "").trim().toLowerCase() || null;
}

function isLocalDatabaseHost(host: string | null) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function assertApplyDatabaseIsLocal() {
  const host = getDatabaseHostForSafetyCheck();
  if (isLocalDatabaseHost(host) || hasFlag("--allow-nonlocal-db")) {
    return;
  }

  throw new Error(
    `Refusing --apply because DATABASE_URL/PGHOST is not local (${host ?? "missing"}). ` +
      "Use --allow-nonlocal-db only from an intended production execution environment."
  );
}

function normalizeDomains(inputDomains: string[]) {
  const parsed = parseDomainBatchInput(inputDomains.join("\n"));
  const seen = new Set<string>();
  const candidates: QueueCandidate[] = [];

  for (const item of parsed.valid) {
    if (seen.has(item.hostname)) {
      continue;
    }

    seen.add(item.hostname);
    candidates.push({
      domain: item.domain,
      hostname: item.hostname,
      normalizedUrl: item.normalizedUrl
    });
  }

  return {
    candidates,
    invalid: parsed.invalid
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length) as R[];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];
      if (item === undefined) {
        continue;
      }
      results[currentIndex] = await mapper(item, currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function validateCandidate(candidate: QueueCandidate): Promise<QueueResult | null> {
  const dns = await checkDomainDnsWithResolvers(candidate.hostname, {
    lookup: (value) => lookup(value, { all: true }),
    resolve4,
    resolve6
  });
  if (dns.exists) {
    return null;
  }

  return {
    ...candidate,
    skipped: true,
    skipReason: dns.reason
  };
}

async function findOrCreateAnonymousDomain(candidate: QueueCandidate) {
  const existing = await queryOne<AnonymousDomainRow>(
    `
      select id, organization_id, hostname, normalized_url
        from domains
       where organization_id is null
         and normalized_url = $1
       order by created_at desc
       limit 1
    `,
    [candidate.normalizedUrl],
    { readOnly: true }
  );

  if (existing) {
    return existing;
  }

  const created = await queryOne<AnonymousDomainRow>(
    `
      insert into domains (hostname, normalized_url)
      values ($1, $2)
      returning id, organization_id, hostname, normalized_url
    `,
    [candidate.hostname, candidate.normalizedUrl]
  );

  if (!created) {
    throw new Error(`Failed to create anonymous domain for ${candidate.hostname}.`);
  }

  return created;
}

async function insertQueuedScan(input: {
  domain: AnonymousDomainRow;
  pagesRequested: number;
  scanConfig: Record<string, unknown>;
}) {
  const scan = await queryOne<{ id: string }>(
    `
      insert into scans (
        organization_id,
        domain_id,
        submitted_by_user_id,
        scan_type,
        status,
        pages_requested,
        pages_scanned,
        scan_config_json,
        queue_priority,
        queue_origin
      )
      values (null, $1, null, 'full', 'queued', $2, 0, $3, $4, $5)
      returning id
    `,
    [input.domain.id, input.pagesRequested, input.scanConfig, QUEUE_PRIORITY, QUEUE_ORIGIN]
  );

  if (!scan) {
    throw new Error(`Failed to queue scan for ${input.domain.hostname}.`);
  }

  return scan;
}

async function insertScanEvent(input: {
  domain: AnonymousDomainRow;
  eventType: string;
  message: string;
  metadataJson: Record<string, unknown>;
  scanId: string;
}) {
  await query(
    `
      insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
      values ($1, $2, null, $3, $4, $5)
    `,
    [input.scanId, input.domain.id, input.eventType, input.message, input.metadataJson]
  );
}

async function setAnonymousDomainLatestScan(input: { domainId: string; scanId: string }) {
  await query(
    `
      update domains
         set latest_scan_id = $2
       where id = $1
    `,
    [input.domainId, input.scanId]
  );
}

async function queueCandidate(input: {
  candidate: QueueCandidate;
  dryRun: boolean;
  pagesRequested: number;
  profile: ScanProfile;
  scanFrom: ScanFrom;
  source: string;
}): Promise<QueueResult> {
  const invalid = await validateCandidate(input.candidate);
  if (invalid) {
    return invalid;
  }

  if (input.dryRun) {
    return {
      ...input.candidate,
      queued: false,
      skipped: false,
      scanId: null
    };
  }

  try {
    const domain = await findOrCreateAnonymousDomain(input.candidate);
    const scanConfig = buildQueuedFullScanConfig({
      hostname: input.candidate.hostname,
      maxPages: input.pagesRequested,
      normalizedUrl: input.candidate.normalizedUrl,
      profile: input.profile,
      scanFrom: input.scanFrom,
      source: input.source
    });
    const scan = await insertQueuedScan({
      domain,
      pagesRequested: input.pagesRequested,
      scanConfig
    });

    await insertScanEvent({
      domain,
      eventType: SCAN_EVENT_TYPES.priorScanAccelerationEvaluated,
      message: "Prior scan acceleration skipped for operator GDPR/ePrivacy cohort rerun.",
      metadataJson: {
        found: false,
        reason: "operator_gdpr_eprivacy_cohort_rerun",
        source: input.source
      },
      scanId: scan.id
    });

    await insertScanEvent({
      domain,
      eventType: FULL_SCAN_EVENT_TYPES.queued,
      message: "GDPR/ePrivacy cohort validation scan queued and awaiting scanner pickup.",
      metadataJson: {
        pagesRequested: input.pagesRequested,
        profile: input.profile,
        queueOrigin: QUEUE_ORIGIN,
        queuePriority: QUEUE_PRIORITY,
        requestedGeo: scanConfig.requestedGeo ?? null,
        scanFrom: input.scanFrom,
        source: input.source
      },
      scanId: scan.id
    });

    await setAnonymousDomainLatestScan({ domainId: domain.id, scanId: scan.id });

    return {
      ...input.candidate,
      queued: true,
      scanId: scan.id
    };
  } catch (error) {
    return {
      ...input.candidate,
      error: error instanceof Error ? error.message : String(error),
      queued: false,
      scanId: null
    };
  }
}

async function main() {
  const dryRun = !hasFlag("--apply");
  if (!dryRun) {
    assertApplyDatabaseIsLocal();
  }

  const source = getArgValue("--source") ?? DEFAULT_SOURCE;
  const scanFrom = normalizeScanFrom(getArgValue("--scan-from") ?? getArgValue("--geo") ?? DEFAULT_SCAN_FROM);
  const concurrency = getPositiveIntegerArg("--concurrency", DEFAULT_CONCURRENCY);
  const pagesRequested = getPositiveIntegerArg("--pages", getPlanDefinition("free").maxPagesPerScan);
  const profile = getProfileArg();
  const domains = getListArg("--domains");
  const { candidates, invalid } = normalizeDomains(domains.length > 0 ? domains : DEFAULT_GDPR_EPRIVACY_RERUN_DOMAINS);

  const results = await mapWithConcurrency(candidates, concurrency, (candidate) =>
    queueCandidate({
      candidate,
      dryRun,
      pagesRequested,
      profile,
      scanFrom,
      source
    })
  );

  const queued = results.filter((result) => result.queued);
  const skipped = results.filter((result) => result.skipped);
  const failed = results.filter((result) => result.error);

  console.log(JSON.stringify(
    {
      concurrency,
      dryRun,
      databaseHost: getDatabaseHostForSafetyCheck(),
      invalid,
      pagesRequested,
      profile,
      results,
      scanFrom,
      source,
      summary: {
        candidateCount: candidates.length,
        failedCount: failed.length,
        invalidCount: invalid.length,
        queuedCount: queued.length,
        skippedCount: skipped.length
      }
    },
    null,
    2
  ));

  if (failed.length > 0 || invalid.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await closePools().catch(() => undefined);
});
