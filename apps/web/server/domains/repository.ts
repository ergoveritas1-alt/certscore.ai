"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";

export type DomainIndustryRow = {
  id: string;
  label: string;
  slug: string;
};

type DomainMonitoringRow = {
  id: string;
  scan_frequency: string | null;
};

export async function listIndustryRows(): Promise<DomainIndustryRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db.from("industries").select("id, slug, label").order("sort_order", { ascending: true }).order("label", { ascending: true });

  if (error) {
    if (Boolean(error.message?.includes("relation \"public.industries\" does not exist"))) {
      return [];
    }

    throw new Error(`Failed to load industries: ${error.message}`);
  }

  return (data ?? []) as DomainIndustryRow[];
}

export async function updateDomainScanFrequency(input: {
  domainId: string;
  organizationId: string;
  scanFrequency: string;
}): Promise<void> {
  const db = createDatabaseClient();
  const { error } = await db
    .from("domains")
    .update({
      scan_frequency: input.scanFrequency
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.domainId);

  if (error) {
    throw new Error(`Could not update domain scan frequency: ${error.message}`);
  }
}

export async function loadDomainMonitoringDomain(input: {
  domainId: string;
  organizationId: string;
}): Promise<DomainMonitoringRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("domains")
    .select("id, scan_frequency")
    .eq("organization_id", input.organizationId)
    .eq("id", input.domainId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load domain monitoring state: ${error.message}`);
  }

  return (data as DomainMonitoringRow | null) ?? null;
}
