import dns from "node:dns/promises";
import type {
  CanonicalEvidenceBundle,
  EndpointEnrichmentOverlay,
  EndpointGeographyPrecision,
  EndpointGeographyStatus,
} from "@certscore/contracts";
import { resolveEndpointGeography, type EndpointGeographyResolution } from "./index.js";

export type EndpointEnrichmentRegistryVersion = "certscore.endpoint_enrichment_registry.1";

export type EndpointEnrichmentRegistryEntry = {
  basis: string[];
  dnsCnameChain: string[];
  endpointGeographyJurisdiction?: string;
  endpointGeographyLocationLabel?: string;
  endpointGeographyPrecision?: EndpointGeographyPrecision;
  endpointGeographyProvider?: string;
  endpointGeographyRegion?: string;
  endpointGeographyStatus: EndpointGeographyStatus | "enrichment_failed";
  enrichmentAttempts: number;
  firstObservedAt: string;
  hostname: string;
  lastEnrichedAt?: string;
  lastError?: string;
  lastObservedAt: string;
  observationCount: number;
  sourceDomains: string[];
  sourceScanIds: string[];
};

export type EndpointEnrichmentRegistry = {
  entries: EndpointEnrichmentRegistryEntry[];
  generatedAt: string;
  registryVersion: EndpointEnrichmentRegistryVersion;
  updatedAt: string;
};

export type EndpointEnrichmentCandidate = {
  hostname: string;
  observedAt: string;
  sourceDomain?: string;
  sourceScanId?: string;
};

export type EndpointEnrichmentReport = {
  candidatesObserved: number;
  entriesAfter: number;
  entriesBefore: number;
  enrichedRegionObserved: number;
  enrichmentFailures: number;
  newEntries: number;
  unknownAfterEnrichment: number;
  updatedEntries: number;
};

export type EndpointEnrichmentRegistryUpdate = {
  registry: EndpointEnrichmentRegistry;
  report: EndpointEnrichmentReport;
};

export type ResolveCname = (hostname: string) => Promise<string[]>;

export type EndpointEnrichmentOptions = {
  enableDnsCname?: boolean;
  maxCnameBranches?: number;
  maxCnameDepth?: number;
  maxHosts?: number;
  now?: Date;
  resolveCname?: ResolveCname;
  timeoutMs?: number;
};

type EndpointEnrichmentResult = {
  basis: string[];
  dnsCnameChain: string[];
  endpointGeographyJurisdiction?: string;
  endpointGeographyLocationLabel?: string;
  endpointGeographyPrecision?: EndpointGeographyPrecision;
  endpointGeographyProvider?: string;
  endpointGeographyRegion?: string;
  endpointGeographyStatus: EndpointGeographyStatus | "enrichment_failed";
  error?: string;
};

const DEFAULT_TIMEOUT_MS = 750;
const DEFAULT_MAX_CNAME_DEPTH = 4;
const DEFAULT_MAX_CNAME_BRANCHES = 4;

export function createEmptyEndpointEnrichmentRegistry(now = new Date()): EndpointEnrichmentRegistry {
  const timestamp = now.toISOString();
  return {
    registryVersion: "certscore.endpoint_enrichment_registry.1",
    generatedAt: timestamp,
    updatedAt: timestamp,
    entries: [],
  };
}

export function collectEndpointEnrichmentCandidatesFromBundle(
  bundle: CanonicalEvidenceBundle,
): EndpointEnrichmentCandidate[] {
  const observedAt = bundle.completedAt ?? bundle.startedAt ?? new Date().toISOString();
  const sourceDomain = hostnameFromUrl(bundle.normalizedUrl) ?? hostnameFromUrl(bundle.url);
  const candidates = bundle.networkEvents.flatMap((event) => {
    if (
      !event.collectionEndpointObserved ||
      event.thirdParty !== true ||
      event.attributionStatus === "site_owned_infrastructure" ||
      event.attributionStatus === "ignored_noise" ||
      event.endpointGeographyStatus === "region_observed"
    ) {
      return [];
    }
    const hostname = normalizeHostname(event.hostname ?? event.requestHostname);
    return hostname ? [{
      hostname,
      observedAt,
      sourceDomain,
      sourceScanId: bundle.scanId,
    }] : [];
  });
  return uniqueCandidates(candidates);
}

export function buildEndpointEnrichmentOverlay(
  bundle: CanonicalEvidenceBundle,
  registry: EndpointEnrichmentRegistry,
  now = new Date(),
): EndpointEnrichmentOverlay {
  const observedHosts = new Set(collectEndpointEnrichmentCandidatesFromBundle(bundle).map((candidate) => candidate.hostname));
  const entriesByHost = new Map(registry.entries.map((entry) => [entry.hostname, entry]));
  const endpointOverlays = [...observedHosts]
    .map((hostname) => entriesByHost.get(hostname))
    .filter((entry): entry is EndpointEnrichmentRegistryEntry =>
      Boolean(entry?.endpointGeographyStatus === "region_observed" && entry.endpointGeographyRegion),
    )
    .map((entry) => ({
      basis: entry.basis,
      dnsCnameChain: entry.dnsCnameChain,
      endpointGeographyJurisdiction: entry.endpointGeographyJurisdiction,
      endpointGeographyLocationLabel: entry.endpointGeographyLocationLabel,
      endpointGeographyPrecision: entry.endpointGeographyPrecision,
      endpointGeographyProvider: entry.endpointGeographyProvider,
      endpointGeographyRegion: entry.endpointGeographyRegion,
      endpointGeographyStatus: "region_observed" as const,
      hostname: entry.hostname,
      registryObservationCount: entry.observationCount,
    }));

  return {
    overlayVersion: "certscore.endpoint_enrichment_overlay.1",
    generatedAt: now.toISOString(),
    sourceBundleScanId: bundle.scanId,
    sourceRegistryUpdatedAt: registry.updatedAt,
    endpointOverlays,
  };
}

export async function updateEndpointEnrichmentRegistry(
  registry: EndpointEnrichmentRegistry,
  candidates: EndpointEnrichmentCandidate[],
  options: EndpointEnrichmentOptions = {},
): Promise<EndpointEnrichmentRegistryUpdate> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const existingByHost = new Map(registry.entries.map((entry) => [entry.hostname, { ...entry }]));
  const unique = uniqueCandidates(candidates).slice(0, options.maxHosts);
  let newEntries = 0;
  let updatedEntries = 0;
  let enrichmentFailures = 0;

  for (const candidate of unique) {
    const hostname = normalizeHostname(candidate.hostname);
    if (!hostname) {
      continue;
    }
    const existing = existingByHost.get(hostname);
    const baseEntry = existing ?? {
      basis: [],
      dnsCnameChain: [],
      endpointGeographyStatus: "not_evaluated" as const,
      enrichmentAttempts: 0,
      firstObservedAt: candidate.observedAt,
      hostname,
      lastObservedAt: candidate.observedAt,
      observationCount: 0,
      sourceDomains: [],
      sourceScanIds: [],
    };

    const shouldEnrich = baseEntry.endpointGeographyStatus !== "region_observed";
    const enrichment = shouldEnrich
      ? await enrichEndpointHostname(hostname, options)
      : entryResult(baseEntry);
    if (enrichment.endpointGeographyStatus === "enrichment_failed") {
      enrichmentFailures += 1;
    }

    const merged = mergeEntry(baseEntry, candidate, enrichment, nowIso, shouldEnrich);
    existingByHost.set(hostname, merged);
    if (existing) {
      updatedEntries += 1;
    } else {
      newEntries += 1;
    }
  }

  const entries = [...existingByHost.values()].sort((left, right) => left.hostname.localeCompare(right.hostname));
  const nextRegistry: EndpointEnrichmentRegistry = {
    ...registry,
    updatedAt: nowIso,
    entries,
  };

  return {
    registry: nextRegistry,
    report: {
      candidatesObserved: unique.length,
      entriesAfter: entries.length,
      entriesBefore: registry.entries.length,
      enrichedRegionObserved: entries.filter((entry) => entry.endpointGeographyStatus === "region_observed").length,
      enrichmentFailures,
      newEntries,
      unknownAfterEnrichment: entries.filter((entry) => entry.endpointGeographyStatus === "unknown").length,
      updatedEntries,
    },
  };
}

export async function enrichEndpointHostname(
  hostname: string,
  options: EndpointEnrichmentOptions = {},
): Promise<EndpointEnrichmentResult> {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return {
      basis: ["host_only_endpoint_geography", "hostname_missing"],
      dnsCnameChain: [],
      endpointGeographyStatus: "unknown",
    };
  }

  const direct = geographyResult(resolveEndpointGeography({
    collectionEndpointObserved: true,
    hostname: normalized,
    thirdParty: true,
  }), []);
  if (direct.endpointGeographyStatus === "region_observed") {
    return direct;
  }

  if (options.enableDnsCname === false) {
    return direct;
  }

  try {
    const dnsCnameChain = await resolveBoundedCnameChain(normalized, options);
    for (const cname of dnsCnameChain) {
      const cnameGeography = geographyResult(resolveEndpointGeography({
        collectionEndpointObserved: true,
        hostname: cname,
        thirdParty: true,
      }), dnsCnameChain);
      if (cnameGeography.endpointGeographyStatus === "region_observed") {
        return {
          ...cnameGeography,
          basis: uniqueStrings([...cnameGeography.basis, "dns_cname_chain"]),
          dnsCnameChain,
        };
      }
    }
    return {
      ...direct,
      basis: uniqueStrings([...direct.basis, dnsCnameChain.length > 0 ? "dns_cname_chain_no_region" : "dns_cname_not_observed"]),
      dnsCnameChain,
    };
  } catch (error) {
    return {
      ...direct,
      basis: uniqueStrings([...direct.basis, "dns_cname_enrichment_failed"]),
      dnsCnameChain: [],
      endpointGeographyStatus: "enrichment_failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveBoundedCnameChain(
  hostname: string,
  options: EndpointEnrichmentOptions,
): Promise<string[]> {
  const resolveCname = options.resolveCname ?? dns.resolveCname;
  const maxDepth = options.maxCnameDepth ?? DEFAULT_MAX_CNAME_DEPTH;
  const maxBranches = options.maxCnameBranches ?? DEFAULT_MAX_CNAME_BRANCHES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const seen = new Set([hostname]);
  const queue: Array<{ depth: number; hostname: string }> = [{ depth: 0, hostname }];
  const chain: string[] = [];

  while (queue.length > 0 && chain.length < maxBranches) {
    const item = queue.shift();
    if (!item || item.depth >= maxDepth) {
      continue;
    }
    const cnames = await withTimeout(resolveCname(item.hostname), timeoutMs)
      .catch((error: unknown) => {
        if (isDnsNoDataError(error)) {
          return [];
        }
        throw error;
      });
    for (const cname of cnames.map(normalizeHostname).filter(Boolean).sort()) {
      if (!cname || seen.has(cname) || chain.length >= maxBranches) {
        continue;
      }
      seen.add(cname);
      chain.push(cname);
      queue.push({ depth: item.depth + 1, hostname: cname });
    }
  }

  return chain;
}

function geographyResult(
  resolution: EndpointGeographyResolution | undefined,
  dnsCnameChain: string[],
): EndpointEnrichmentResult {
  return {
    basis: resolution?.basis ?? ["host_only_endpoint_geography", "not_evaluated"],
    dnsCnameChain,
    endpointGeographyJurisdiction: resolution?.jurisdiction,
    endpointGeographyLocationLabel: resolution?.locationLabel,
    endpointGeographyPrecision: resolution?.precision,
    endpointGeographyProvider: resolution?.provider,
    endpointGeographyRegion: resolution?.region,
    endpointGeographyStatus: resolution?.status ?? "not_evaluated",
  };
}

function mergeEntry(
  existing: EndpointEnrichmentRegistryEntry,
  candidate: EndpointEnrichmentCandidate,
  enrichment: EndpointEnrichmentResult,
  nowIso: string,
  enriched: boolean,
): EndpointEnrichmentRegistryEntry {
  const preserveObserved = existing.endpointGeographyStatus === "region_observed" &&
    enrichment.endpointGeographyStatus !== "region_observed";
  return {
    ...existing,
    ...(preserveObserved ? {} : {
      basis: enrichment.basis,
      dnsCnameChain: enrichment.dnsCnameChain,
      endpointGeographyJurisdiction: enrichment.endpointGeographyJurisdiction,
      endpointGeographyLocationLabel: enrichment.endpointGeographyLocationLabel,
      endpointGeographyPrecision: enrichment.endpointGeographyPrecision,
      endpointGeographyProvider: enrichment.endpointGeographyProvider,
      endpointGeographyRegion: enrichment.endpointGeographyRegion,
      endpointGeographyStatus: enrichment.endpointGeographyStatus,
      lastError: enrichment.error,
    }),
    enrichmentAttempts: existing.enrichmentAttempts + (enriched ? 1 : 0),
    lastEnrichedAt: enriched ? nowIso : existing.lastEnrichedAt,
    lastObservedAt: maxIso(existing.lastObservedAt, candidate.observedAt),
    observationCount: existing.observationCount + 1,
    sourceDomains: uniqueStrings([
      ...existing.sourceDomains,
      ...(candidate.sourceDomain ? [candidate.sourceDomain] : []),
    ]).slice(0, 25),
    sourceScanIds: uniqueStrings([
      ...existing.sourceScanIds,
      ...(candidate.sourceScanId ? [candidate.sourceScanId] : []),
    ]).slice(0, 50),
  };
}

function entryResult(entry: EndpointEnrichmentRegistryEntry): EndpointEnrichmentResult {
  return {
    basis: entry.basis,
    dnsCnameChain: entry.dnsCnameChain,
    endpointGeographyJurisdiction: entry.endpointGeographyJurisdiction,
    endpointGeographyLocationLabel: entry.endpointGeographyLocationLabel,
    endpointGeographyPrecision: entry.endpointGeographyPrecision,
    endpointGeographyProvider: entry.endpointGeographyProvider,
    endpointGeographyRegion: entry.endpointGeographyRegion,
    endpointGeographyStatus: entry.endpointGeographyStatus,
  };
}

function uniqueCandidates(candidates: EndpointEnrichmentCandidate[]): EndpointEnrichmentCandidate[] {
  const byHost = new Map<string, EndpointEnrichmentCandidate>();
  for (const candidate of candidates) {
    const hostname = normalizeHostname(candidate.hostname);
    if (!hostname) {
      continue;
    }
    const existing = byHost.get(hostname);
    byHost.set(hostname, {
      hostname,
      observedAt: existing ? minIso(existing.observedAt, candidate.observedAt) : candidate.observedAt,
      sourceDomain: existing?.sourceDomain ?? candidate.sourceDomain,
      sourceScanId: existing?.sourceScanId ?? candidate.sourceScanId,
    });
  }
  return [...byHost.values()].sort((left, right) => left.hostname.localeCompare(right.hostname));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`endpoint_enrichment_timeout_${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function isDnsNoDataError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  return ["ENODATA", "ENOTFOUND", "ENODOMAIN", "ENORECFOUND"].includes(code);
}

function hostnameFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return undefined;
  }
}

function normalizeHostname(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\.$/, "").toLowerCase();
  return normalized || undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function minIso(left: string, right: string): string {
  return left <= right ? left : right;
}

function maxIso(left: string, right: string): string {
  return left >= right ? left : right;
}
