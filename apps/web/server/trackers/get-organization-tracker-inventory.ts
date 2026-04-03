"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  getHybridPreconsentTrackerVendors,
  getHybridPreconsentViolationCount
} from "../../lib/scans/hybrid-runtime-evidence";

type CompletedScanRow = {
  completed_at: string;
  domain_id: string | null;
  id: string;
};

type DomainRow = {
  hostname: string;
  id: string;
};

type TrackerRow = {
  before_consent: boolean | null;
  collection_endpoint_type: string | null;
  confidence: number | null;
  first_party_or_third_party: string;
  scan_id: string;
  script_host: string | null;
  vendor_category: string;
  vendor_name: string;
};

type RuntimeArtifactRow = {
  consent_preconsent_violation_count: number | null;
  hybrid_runtime_evidence?: Record<string, unknown> | null;
  scan_id: string;
};

type PreconsentViolationRow = {
  scan_id: string;
  vendor_category: string;
  vendor_name: string;
};

export type OrganizationTrackerLeaderboardItem = {
  advertisingCount: number;
  beforeConsentCount: number;
  collectionProxyCount: number;
  domainCount: number;
  firstPartyCount: number;
  latestSeenAt: string | null;
  sessionReplayCount: number;
  vendorCategory: string;
  vendorName: string;
};

export type OrganizationDomainTrackerInventoryItem = {
  completedAt: string;
  domainHostname: string;
  preconsentViolationCount: number;
  scanId: string;
  trackers: Array<{
    beforeConsent: boolean | null;
    collectionEndpointType: string;
    confidence: number;
    firstPartyOrThirdParty: string;
    scriptHost: string | null;
    vendorCategory: string;
    vendorName: string;
  }>;
};

export type OrganizationPreconsentLeaderboardItem = {
  domainCount: number;
  latestSeenAt: string | null;
  totalViolationCount: number;
  vendorCategory: string;
  vendorName: string;
};

export async function getOrganizationTrackerInventory(organizationId: string) {
  const supabase = createAdminClient();
  const { data: completedScans, error: scansError } = await supabase
    .from("scans")
    .select("id, domain_id, completed_at")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(500);

  if (scansError) {
    throw new Error(`Failed to load tracker inventory scans: ${scansError.message}`);
  }

  const latestByDomain = new Map<string, CompletedScanRow>();
  for (const scan of (completedScans ?? []) as CompletedScanRow[]) {
    if (!scan.domain_id || latestByDomain.has(scan.domain_id)) {
      continue;
    }
    latestByDomain.set(scan.domain_id, scan);
  }

  const latestScans = [...latestByDomain.values()];
  const domainIds = latestScans.map((scan) => scan.domain_id).filter((value): value is string => Boolean(value));
  const scanIds = latestScans.map((scan) => scan.id);

  const [{ data: domains, error: domainsError }, { data: trackers, error: trackersError }, { data: runtimeArtifacts, error: runtimeArtifactsError }, { data: preconsentViolations, error: preconsentViolationsError }] = await Promise.all([
    domainIds.length
      ? supabase.from("domains").select("id, hostname").eq("organization_id", organizationId).in("id", domainIds)
      : Promise.resolve({ data: [] as DomainRow[], error: null }),
    scanIds.length
      ? supabase
          .from("scan_tracker_vendors")
          .select(
            "scan_id, vendor_name, vendor_category, confidence, first_party_or_third_party, collection_endpoint_type, before_consent, script_host"
          )
          .in("scan_id", scanIds)
      : Promise.resolve({ data: [] as TrackerRow[], error: null }),
    scanIds.length
      ? supabase
          .from("scan_runtime_artifacts")
          .select("scan_id, consent_preconsent_violation_count, hybrid_runtime_evidence")
          .in("scan_id", scanIds)
      : Promise.resolve({ data: [] as RuntimeArtifactRow[], error: null }),
    scanIds.length
      ? supabase
          .from("scan_preconsent_violations")
          .select("scan_id, vendor_name, vendor_category")
          .in("scan_id", scanIds)
      : Promise.resolve({ data: [] as PreconsentViolationRow[], error: null })
  ]);

  if (domainsError) {
    throw new Error(`Failed to load tracker inventory domains: ${domainsError.message}`);
  }
  if (trackersError) {
    throw new Error(`Failed to load tracker inventory trackers: ${trackersError.message}`);
  }
  if (runtimeArtifactsError) {
    throw new Error(`Failed to load tracker inventory runtime artifacts: ${runtimeArtifactsError.message}`);
  }
  if (preconsentViolationsError) {
    throw new Error(`Failed to load tracker inventory pre-consent violations: ${preconsentViolationsError.message}`);
  }

  const domainMap = new Map(((domains ?? []) as DomainRow[]).map((domain) => [domain.id, domain.hostname]));
  const scanMap = new Map(latestScans.map((scan) => [scan.id, scan]));
  const runtimeArtifactMap = new Map(((runtimeArtifacts ?? []) as RuntimeArtifactRow[]).map((artifact) => [artifact.scan_id, artifact]));

  const leaderboard = new Map<string, OrganizationTrackerLeaderboardItem & { domainHostnames: Set<string> }>();
  const preconsentLeaderboard = new Map<string, OrganizationPreconsentLeaderboardItem & { domainHostnames: Set<string> }>();
  for (const tracker of (trackers ?? []) as TrackerRow[]) {
    const scan = scanMap.get(tracker.scan_id);
    const domainId = scan?.domain_id ?? null;
    const domainHostname = domainId ? domainMap.get(domainId) : null;
    const key = `${tracker.vendor_name}::${tracker.vendor_category}`;
    const existing = leaderboard.get(key);

    if (existing) {
      if (domainHostname) {
        existing.domainHostnames.add(domainHostname);
        existing.domainCount = existing.domainHostnames.size;
      }
      existing.beforeConsentCount += tracker.before_consent ? 1 : 0;
      existing.firstPartyCount += tracker.first_party_or_third_party === "first_party" ? 1 : 0;
      existing.collectionProxyCount += tracker.collection_endpoint_type === "first_party_collection_proxy" ? 1 : 0;
      existing.advertisingCount += tracker.vendor_category === "advertising" ? 1 : 0;
      existing.sessionReplayCount += tracker.vendor_category === "session_replay" ? 1 : 0;
      if (scan?.completed_at && (!existing.latestSeenAt || scan.completed_at > existing.latestSeenAt)) {
        existing.latestSeenAt = scan.completed_at;
      }
      continue;
    }

    leaderboard.set(key, {
      advertisingCount: tracker.vendor_category === "advertising" ? 1 : 0,
      beforeConsentCount: tracker.before_consent ? 1 : 0,
      collectionProxyCount: tracker.collection_endpoint_type === "first_party_collection_proxy" ? 1 : 0,
      domainCount: domainHostname ? 1 : 0,
      domainHostnames: new Set(domainHostname ? [domainHostname] : []),
      firstPartyCount: tracker.first_party_or_third_party === "first_party" ? 1 : 0,
      latestSeenAt: scan?.completed_at ?? null,
      sessionReplayCount: tracker.vendor_category === "session_replay" ? 1 : 0,
      vendorCategory: tracker.vendor_category,
      vendorName: tracker.vendor_name
    });
  }

  for (const violation of (preconsentViolations ?? []) as PreconsentViolationRow[]) {
    const scan = scanMap.get(violation.scan_id);
    const domainId = scan?.domain_id ?? null;
    const domainHostname = domainId ? domainMap.get(domainId) : null;
    const key = `${violation.vendor_name}::${violation.vendor_category}`;
    const existing = preconsentLeaderboard.get(key);

    if (existing) {
      if (domainHostname) {
        existing.domainHostnames.add(domainHostname);
        existing.domainCount = existing.domainHostnames.size;
      }
      existing.totalViolationCount += 1;
      if (scan?.completed_at && (!existing.latestSeenAt || scan.completed_at > existing.latestSeenAt)) {
        existing.latestSeenAt = scan.completed_at;
      }
      continue;
    }

    preconsentLeaderboard.set(key, {
      domainCount: domainHostname ? 1 : 0,
      domainHostnames: new Set(domainHostname ? [domainHostname] : []),
      latestSeenAt: scan?.completed_at ?? null,
      totalViolationCount: 1,
      vendorCategory: violation.vendor_category,
      vendorName: violation.vendor_name
    });
  }

  if (((preconsentViolations ?? []) as PreconsentViolationRow[]).length === 0) {
    for (const artifact of (runtimeArtifacts ?? []) as RuntimeArtifactRow[]) {
      const scan = scanMap.get(artifact.scan_id);
      const domainId = scan?.domain_id ?? null;
      const domainHostname = domainId ? domainMap.get(domainId) : null;
      const hybridRuntimeArtifact = {
        hybrid_runtime_evidence: artifact.hybrid_runtime_evidence ?? null
      } satisfies Record<string, unknown>;
      for (const vendorName of getHybridPreconsentTrackerVendors(hybridRuntimeArtifact)) {
        const key = `${vendorName}::unknown`;
        const existing = preconsentLeaderboard.get(key);
        if (existing) {
          if (domainHostname) {
            existing.domainHostnames.add(domainHostname);
            existing.domainCount = existing.domainHostnames.size;
          }
          existing.totalViolationCount += 1;
          if (scan?.completed_at && (!existing.latestSeenAt || scan.completed_at > existing.latestSeenAt)) {
            existing.latestSeenAt = scan.completed_at;
          }
          continue;
        }

        preconsentLeaderboard.set(key, {
          domainCount: domainHostname ? 1 : 0,
          domainHostnames: new Set(domainHostname ? [domainHostname] : []),
          latestSeenAt: scan?.completed_at ?? null,
          totalViolationCount: 1,
          vendorCategory: "unknown",
          vendorName
        });
      }
    }
  }

  const byScan = new Map<string, OrganizationDomainTrackerInventoryItem>();
  for (const scan of latestScans) {
    const hostname = scan.domain_id ? domainMap.get(scan.domain_id) : null;
    if (!hostname) {
      continue;
    }
    byScan.set(scan.id, {
      completedAt: scan.completed_at,
      domainHostname: hostname,
      preconsentViolationCount: Math.max(
        Number(runtimeArtifactMap.get(scan.id)?.consent_preconsent_violation_count ?? 0),
        getHybridPreconsentViolationCount({
          hybrid_runtime_evidence: runtimeArtifactMap.get(scan.id)?.hybrid_runtime_evidence ?? null
        }) ?? 0
      ),
      scanId: scan.id,
      trackers: []
    });
  }

  for (const tracker of (trackers ?? []) as TrackerRow[]) {
    const entry = byScan.get(tracker.scan_id);
    if (!entry) {
      continue;
    }
    entry.trackers.push({
      beforeConsent: tracker.before_consent,
      collectionEndpointType: tracker.collection_endpoint_type ?? "unknown",
      confidence: Number(tracker.confidence ?? 0),
      firstPartyOrThirdParty: tracker.first_party_or_third_party,
      scriptHost: tracker.script_host,
      vendorCategory: tracker.vendor_category,
      vendorName: tracker.vendor_name
    });
  }

  return {
    leaderboard: [...leaderboard.values()]
      .map(({ domainHostnames: _domainHostnames, ...row }) => row)
      .sort((left, right) => right.domainCount - left.domainCount || left.vendorName.localeCompare(right.vendorName)),
    preconsentLeaderboard: [...preconsentLeaderboard.values()]
      .map(({ domainHostnames: _domainHostnames, ...row }) => row)
      .sort((left, right) => right.domainCount - left.domainCount || right.totalViolationCount - left.totalViolationCount || left.vendorName.localeCompare(right.vendorName)),
    latestPerDomain: [...byScan.values()].sort((left, right) => right.completedAt.localeCompare(left.completedAt))
  };
}
