"use server";

import { deriveDisplayCreatedAt } from "../scans/display-state";
import { loadDomainDetail, loadDomainScanHistory, loadIndustryById } from "./repository";

export type DomainDetailRecord = {
  id: string;
  hostname: string;
  industryPrimaryId: string | null;
  industryPrimaryLabel: string | null;
  industryPrimarySlug: string | null;
  lastScannedAt: string | null;
  normalizedUrl: string;
  latestScanId: string | null;
  scanFrequency: string | null;
  maxPagesOverride: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DomainScanHistoryItem = {
  id: string;
  scanType: string;
  status: string;
  pagesRequested: number;
  pagesScanned: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export async function getDomainById(input: { domainId: string; organizationId: string }) {
  const domain = await loadDomainDetail(input);

  if (!domain) {
    return null;
  }

  const [scans, industry] = await Promise.all([
    loadDomainScanHistory(input),
    domain.industry_primary_id ? loadIndustryById(domain.industry_primary_id) : Promise.resolve(null)
  ]);

  return {
    domain: {
      id: domain.id,
      hostname: domain.hostname,
      industryPrimaryId: domain.industry_primary_id,
      industryPrimaryLabel: industry?.label ?? null,
      industryPrimarySlug: industry?.slug ?? null,
      lastScannedAt: domain.last_scanned_at,
      normalizedUrl: domain.normalized_url,
      latestScanId: domain.latest_scan_id,
      scanFrequency: domain.scan_frequency,
      maxPagesOverride: domain.max_pages_override,
      createdAt: domain.created_at,
      updatedAt: domain.updated_at
    } satisfies DomainDetailRecord,
    scans: scans.map(
      (scan) =>
        ({
          id: scan.id,
          scanType: scan.scan_type,
          status: scan.status,
          pagesRequested: scan.pages_requested,
          pagesScanned: scan.pages_scanned,
          createdAt: deriveDisplayCreatedAt({
            completedAt: scan.completed_at,
            createdAt: scan.created_at,
            startedAt: scan.started_at
          }),
          startedAt: scan.started_at,
          completedAt: scan.completed_at
        }) satisfies DomainScanHistoryItem
    )
  };
}
