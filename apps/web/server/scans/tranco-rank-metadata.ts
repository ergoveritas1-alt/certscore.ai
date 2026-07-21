import { queryOne } from "@website-signal-risk-scanner/db";
import type { SharedScanConfig, SharedTrancoRankMetadata } from "@website-signal-risk-scanner/shared";
import { getDomain as getTldtsDomain, getHostname as getTldtsHostname } from "tldts";

type TrancoRankRow = {
  hostname: string;
  list_id: string | null;
  rank_band: string | null;
  source: SharedTrancoRankMetadata["source"];
  tranco_rank: number | null;
  updated_at: Date | string | null;
};

export type TrancoRankLookupCandidates = {
  candidates: string[];
  lookupHostname: string;
  lookupRegistrableDomain: string | null;
};

function recordObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function trancoRankFromScanConfig(scanConfig: Record<string, unknown> | null | undefined) {
  const siteMetadata = recordObject(scanConfig?.siteMetadata);
  const tranco = recordObject(siteMetadata?.tranco);
  const rank = tranco?.rank;
  return typeof rank === "number" && Number.isFinite(rank) && rank > 0 ? Math.trunc(rank) : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function normalizeLookupHostname(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase().replace(/\.$/, "") ?? "";
  if (!trimmed) {
    return null;
  }
  return getTldtsHostname(trimmed) ?? getTldtsHostname(`https://${trimmed}`) ?? trimmed;
}

export function buildTrancoRankLookupCandidates(input: {
  hostname?: string | null;
  normalizedUrl?: string | null;
}): TrancoRankLookupCandidates | null {
  const lookupHostname = normalizeLookupHostname(input.hostname) ?? normalizeLookupHostname(input.normalizedUrl);
  if (!lookupHostname) {
    return null;
  }

  const lookupRegistrableDomain = getTldtsDomain(lookupHostname) ?? lookupHostname.replace(/^www\./, "");
  const hostnameWithoutWww = lookupHostname.replace(/^www\./, "");
  const candidates = uniqueStrings([
    lookupHostname,
    hostnameWithoutWww === lookupHostname ? null : hostnameWithoutWww,
    lookupRegistrableDomain,
  ]);

  return {
    candidates,
    lookupHostname,
    lookupRegistrableDomain
  };
}

function matchTypeFor(input: {
  lookup: TrancoRankLookupCandidates;
  matchedHostname: string;
}): SharedTrancoRankMetadata["matchType"] {
  if (input.matchedHostname === input.lookup.lookupHostname) {
    return "exact_hostname";
  }
  if (input.matchedHostname === input.lookup.lookupHostname.replace(/^www\./, "")) {
    return "hostname_without_www";
  }
  if (input.matchedHostname === input.lookup.lookupRegistrableDomain) {
    return "registrable_domain";
  }
  return "candidate_hostname";
}

function toIsoTimestamp(value: Date | string | null | undefined) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  return typeof value === "string" && value.trim() ? value : null;
}

export async function lookupTrancoRankMetadata(input: {
  hostname?: string | null;
  normalizedUrl?: string | null;
}): Promise<SharedTrancoRankMetadata | null> {
  const lookup = buildTrancoRankLookupCandidates(input);
  if (!lookup) {
    return null;
  }

  const row = await queryOne<TrancoRankRow>(
    `
      select hostname, list_id, rank_band, source, tranco_rank, updated_at
        from (
          select ranking.hostname,
                 ranking.list_id,
                 null::text as rank_band,
                 'static_snapshot'::text as source,
                 ranking.tranco_rank,
                 snapshot.imported_at as updated_at,
                 0 as source_priority
            from tranco_rank_settings settings
            join tranco_rank_snapshots snapshot
              on snapshot.list_id = settings.active_list_id
            join tranco_rankings ranking
              on ranking.list_id = snapshot.list_id
           where settings.singleton = true
             and ranking.hostname = any($1::text[])
          union all
          select hostname,
                 null::text as list_id,
                 rank_band,
                 'validation_targets'::text as source,
                 tranco_rank,
                 updated_at,
                 1 as source_priority
            from validation_targets
           where hostname = any($1::text[])
             and tranco_rank is not null
        ) candidates
       order by source_priority, array_position($1::text[], hostname), tranco_rank asc
       limit 1
    `,
    [lookup.candidates],
    { readOnly: true }
  );

  if (!row?.tranco_rank || row.tranco_rank <= 0) {
    return null;
  }

  return {
    lookupHostname: lookup.lookupHostname,
    lookupRegistrableDomain: lookup.lookupRegistrableDomain,
    matchType: matchTypeFor({ lookup, matchedHostname: row.hostname }),
    rank: row.tranco_rank,
    rankBand: row.rank_band,
    matchedHostname: row.hostname,
    source: row.source,
    sourceListId: row.list_id,
    sourceUpdatedAt: toIsoTimestamp(row.updated_at)
  };
}

export function withTrancoRankMetadata<T extends SharedScanConfig>(
  scanConfig: T,
  trancoRankMetadata: SharedTrancoRankMetadata | null | undefined,
): T {
  if (!trancoRankMetadata) {
    return scanConfig;
  }

  return {
    ...scanConfig,
    siteMetadata: {
      ...(scanConfig.siteMetadata ?? {}),
      tranco: trancoRankMetadata
    }
  };
}
