"use server";

import {
  loadTrackerInventoryCompletedScans,
  loadTrackerInventoryRelatedData,
  type TrackerInventoryCompletedScanRow,
  type TrackerInventoryPreconsentViolationRow,
  type TrackerInventoryRuntimeArtifactRow,
  type TrackerInventoryTrackerRow
} from "./repository";
import { normalizeCompletedScanRows } from "./normalize-completed-scan-rows";

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
  const completedScans = normalizeCompletedScanRows(await loadTrackerInventoryCompletedScans(organizationId));

  const latestByDomain = new Map<string, (typeof completedScans)[number]>();
  for (const scan of completedScans) {
    if (!scan.domain_id || latestByDomain.has(scan.domain_id)) {
      continue;
    }
    latestByDomain.set(scan.domain_id, scan);
  }

  const latestScans = [...latestByDomain.values()];
  const domainIds = latestScans.map((scan) => scan.domain_id).filter((value): value is string => Boolean(value));
  const scanIds = latestScans.map((scan) => scan.id);

  const { domains, trackers, runtimeArtifacts, preconsentViolations } = await loadTrackerInventoryRelatedData({
    domainIds,
    organizationId,
    scanIds
  });

  const domainMap = new Map(domains.map((domain) => [domain.id, domain.hostname]));
  const scanMap = new Map(latestScans.map((scan) => [scan.id, scan]));
  const runtimeArtifactMap = new Map(runtimeArtifacts.map((artifact) => [artifact.scan_id, artifact]));

  const leaderboard = new Map<string, OrganizationTrackerLeaderboardItem & { domainHostnames: Set<string> }>();
  const preconsentLeaderboard = new Map<string, OrganizationPreconsentLeaderboardItem & { domainHostnames: Set<string> }>();
  for (const tracker of trackers as TrackerInventoryTrackerRow[]) {
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

  for (const violation of preconsentViolations as TrackerInventoryPreconsentViolationRow[]) {
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

  const byScan = new Map<string, OrganizationDomainTrackerInventoryItem>();
  for (const scan of latestScans) {
    const hostname = scan.domain_id ? domainMap.get(scan.domain_id) : null;
    if (!hostname) {
      continue;
    }
    byScan.set(scan.id, {
      completedAt: scan.completed_at,
      domainHostname: hostname,
      preconsentViolationCount: Number(runtimeArtifactMap.get(scan.id)?.consent_preconsent_violation_count ?? 0),
      scanId: scan.id,
      trackers: []
    });
  }

  for (const tracker of trackers as TrackerInventoryTrackerRow[]) {
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
