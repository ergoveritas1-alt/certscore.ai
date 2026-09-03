import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildNonEssentialInventoryTallies,
  buildRuntimeInventoryUngroupedRows,
  type SanitizedRequestEvidenceRow,
  type TrackerInventoryRow,
} from "../apps/web/lib/scans/runtime-inventory-projection";
import type { RuntimeCookieEvidenceRow } from "../apps/web/lib/scans/runtime-cookie-evidence";
import {
  INDUSTRY_BENCHMARK_LABELS,
  INDUSTRY_BENCHMARK_SLUGS,
  normalizeIndustryBenchmarkSlug,
  type IndustryBenchmarkSlug,
} from "../apps/web/components/scans/report-lab/industry-benchmark-taxonomy";

const execFileAsync = promisify(execFile);
const READ_CONCURRENCY = 12;

type Aggregate = {
  nonEssentialCookiesStorage: number;
  nonEssentialRequests: number;
  siteCount: number;
};

type ScanIndexRow = {
  domain: string;
  scan_id: string;
  scanned_at: string;
};

type CappedRows = {
  cap?: { truncated?: boolean };
  items?: unknown[];
};

type EvidencePacket = {
  cookieStorageInventory?: CappedRows;
  domain?: string;
  requestEvidenceInventory?: CappedRows;
  scanStatus?: string;
  summary?: { benchmark?: string };
  trackerRows?: CappedRows;
};

function emptyAggregate(): Aggregate {
  return { nonEssentialCookiesStorage: 0, nonEssentialRequests: 0, siteCount: 0 };
}

function roundAverage(total: number, count: number) {
  return count > 0 ? Math.round((total / count) * 10) / 10 : null;
}

async function loadLatestRetainedSites(databasePath: string) {
  const query = `
    with ranked as (
      select
        domain,
        scan_id,
        scanned_at,
        row_number() over (
          partition by lower(trim(domain))
          order by id desc
        ) as recency_rank
      from scans
      where evidence_status = 'retained'
        and status in ('completed', 'completed_limited')
        and scan_id is not null
    )
    select domain, scan_id, scanned_at
    from ranked
    where recency_rank = 1
    order by lower(domain);
  `;
  const { stdout } = await execFileAsync("sqlite3", ["-readonly", "-json", databasePath, query], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout) as ScanIndexRow[];
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  callback: (value: T, index: number) => Promise<U>,
) {
  const output = new Array<U>(values.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      output[index] = await callback(values[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

async function main() {
  const databasePath = process.argv[2];
  const evidenceDirectory = process.argv[3];
  if (!databasePath || !evidenceDirectory) {
    throw new Error("Usage: generate-evidence-industry-benchmark-data.ts <data.db> <evidence-directory>");
  }

  const indexRows = await loadLatestRetainedSites(databasePath);
  const aggregates = new Map<IndustryBenchmarkSlug, Aggregate>(
    INDUSTRY_BENCHMARK_SLUGS.map((slug) => [slug, emptyAggregate()]),
  );
  const exclusions = {
    invalidPacket: 0,
    missingIndustry: 0,
    missingPacket: 0,
    truncatedInventory: 0,
    unsupportedIndustry: 0,
  };
  const allIndustries = emptyAggregate();
  let earliestIncludedAt: string | null = null;
  let latestIncludedAt: string | null = null;

  const results = await mapWithConcurrency(indexRows, READ_CONCURRENCY, async (row, index) => {
    if ((index + 1) % 500 === 0) {
      process.stderr.write(`Read ${index + 1}/${indexRows.length} latest-site packets\n`);
    }
    let packet: EvidencePacket;
    try {
      packet = JSON.parse(await readFile(path.join(evidenceDirectory, `${row.scan_id}.json`), "utf8")) as EvidencePacket;
    } catch (error) {
      return { error: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missingPacket" as const : "invalidPacket" as const };
    }
    const benchmark = packet.summary?.benchmark?.trim();
    if (!benchmark) return { error: "missingIndustry" as const };
    const slug = normalizeIndustryBenchmarkSlug(benchmark);
    if (!slug) return { error: "unsupportedIndustry" as const };
    if (packet.cookieStorageInventory?.cap?.truncated || packet.trackerRows?.cap?.truncated) {
      return { error: "truncatedInventory" as const };
    }
    try {
      const rows = buildRuntimeInventoryUngroupedRows({
        cookieRows: (packet.cookieStorageInventory?.items ?? []) as RuntimeCookieEvidenceRow[],
        firstPartyDomain: packet.domain ?? row.domain,
        requestRows: (packet.requestEvidenceInventory?.items ?? []) as SanitizedRequestEvidenceRow[],
        trackerRows: (packet.trackerRows?.items ?? []) as TrackerInventoryRow[],
      });
      return { row, slug, tallies: buildNonEssentialInventoryTallies(rows) };
    } catch {
      return { error: "invalidPacket" as const };
    }
  });

  for (const result of results) {
    if ("error" in result) {
      exclusions[result.error] += 1;
      continue;
    }
    const aggregate = aggregates.get(result.slug)!;
    aggregate.nonEssentialRequests += result.tallies.requests;
    aggregate.nonEssentialCookiesStorage += result.tallies.cookiesStorage;
    aggregate.siteCount += 1;
    allIndustries.nonEssentialRequests += result.tallies.requests;
    allIndustries.nonEssentialCookiesStorage += result.tallies.cookiesStorage;
    allIndustries.siteCount += 1;
    earliestIncludedAt = !earliestIncludedAt || result.row.scanned_at < earliestIncludedAt
      ? result.row.scanned_at
      : earliestIncludedAt;
    latestIncludedAt = !latestIncludedAt || result.row.scanned_at > latestIncludedAt
      ? result.row.scanned_at
      : latestIncludedAt;
  }

  const rows = INDUSTRY_BENCHMARK_SLUGS.map((slug) => {
    const aggregate = aggregates.get(slug)!;
    return {
      averageNonEssentialCookiesStorage: roundAverage(aggregate.nonEssentialCookiesStorage, aggregate.siteCount),
      averageNonEssentialRequests: roundAverage(aggregate.nonEssentialRequests, aggregate.siteCount),
      label: INDUSTRY_BENCHMARK_LABELS[slug],
      sampleSize: aggregate.siteCount,
      slug,
    };
  });

  console.log("__INDUSTRY_BENCHMARK_EVIDENCE_JSON_START__");
  console.log(JSON.stringify({
    allIndustries: {
      averageNonEssentialCookiesStorage: roundAverage(allIndustries.nonEssentialCookiesStorage, allIndustries.siteCount),
      averageNonEssentialRequests: roundAverage(allIndustries.nonEssentialRequests, allIndustries.siteCount),
      sampleSize: allIndustries.siteCount,
    },
    exclusions,
    generatedAt: new Date().toISOString(),
    rows,
    source: "Local retained evidence corpus; latest retained completed packet per unique site",
    sourceSiteCount: indexRows.length,
    windowEnd: latestIncludedAt,
    windowStart: earliestIncludedAt,
  }));
  console.log("__INDUSTRY_BENCHMARK_EVIDENCE_JSON_END__");
}

void main();
