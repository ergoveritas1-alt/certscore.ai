import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { PlanCode, ScanFrequency } from "@website-signal-risk-scanner/shared";
import { getDomainScanFrequency } from "./get-domain-scan-frequency";
import { isDomainScanDue } from "./is-domain-scan-due";

type DomainRow = {
  id: string;
  hostname: string;
  max_pages_override: number | null;
  organization_id: string;
  scan_frequency: string | null;
};

type OrganizationRow = {
  id: string;
  plan: PlanCode;
};

type ScanRow = {
  completed_at: string | null;
  domain_id: string;
  id: string;
  pages_requested: number;
  scan_config_json: Record<string, unknown> | null;
  status: string;
  scan_type: string;
};

export type DueDomainRecord = {
  activeScanExists: boolean;
  domainId: string;
  effectiveFrequency: ScanFrequency;
  hostname: string;
  lastCompletedAt: string | null;
  maxPagesOverride: number | null;
  organizationId: string;
  organizationPlan: PlanCode;
};

export async function getDueDomains(now = new Date()): Promise<DueDomainRecord[]> {
  const supabase = createAdminClient();
  const [{ data: domains, error: domainsError }, { data: organizations, error: organizationsError }, { data: scans, error: scansError }] =
    await Promise.all([
      supabase.from("domains").select("id, organization_id, hostname, scan_frequency, max_pages_override").not("organization_id", "is", null),
      supabase.from("organizations").select("id, plan"),
      supabase
        .from("scans")
        .select("id, domain_id, scan_type, status, completed_at, pages_requested, scan_config_json")
        .in("scan_type", ["full", "scheduled"])
    ]);

  if (domainsError) {
    throw new Error(`Failed to load domains for scheduling: ${domainsError.message}`);
  }

  if (organizationsError) {
    throw new Error(`Failed to load organizations for scheduling: ${organizationsError.message}`);
  }

  if (scansError) {
    throw new Error(`Failed to load scans for scheduling: ${scansError.message}`);
  }

  const organizationMap = new Map(((organizations ?? []) as OrganizationRow[]).map((organization) => [organization.id, organization]));
  const scansByDomain = new Map<string, ScanRow[]>();

  for (const scan of (scans ?? []) as ScanRow[]) {
    if (!scan.domain_id) continue;
    const bucket = scansByDomain.get(scan.domain_id) ?? [];
    bucket.push(scan);
    scansByDomain.set(scan.domain_id, bucket);
  }

  const dueDomains: DueDomainRecord[] = [];

  for (const domain of (domains ?? []) as DomainRow[]) {
    const organization = organizationMap.get(domain.organization_id);

    if (!organization) {
      continue;
    }

    const domainScans = scansByDomain.get(domain.id) ?? [];
    const latestCompleted = domainScans
      .filter((scan) => scan.status === "completed" && scan.completed_at)
      .sort((left, right) => new Date(right.completed_at ?? 0).getTime() - new Date(left.completed_at ?? 0).getTime())[0] ?? null;
    const activeScanExists = domainScans.some((scan) => scan.status === "queued" || scan.status === "running");
    const effectiveFrequency = await getDomainScanFrequency({
      organizationId: domain.organization_id,
      organizationPlan: organization.plan,
      domainFrequency: domain.scan_frequency
    });

    if (
      isDomainScanDue({
        activeScanExists,
        frequency: effectiveFrequency,
        lastCompletedAt: latestCompleted?.completed_at ?? null,
        now
      })
    ) {
        dueDomains.push({
          domainId: domain.id,
          organizationId: domain.organization_id,
          organizationPlan: organization.plan,
          hostname: domain.hostname,
          effectiveFrequency,
          lastCompletedAt: latestCompleted?.completed_at ?? null,
          activeScanExists,
          maxPagesOverride: domain.max_pages_override
        });
    }
  }

  dueDomains.sort((left, right) => left.hostname.localeCompare(right.hostname));
  return dueDomains;
}
