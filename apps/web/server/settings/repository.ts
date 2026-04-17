"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";

export type OrganizationSettingsRow = {
  default_scan_frequency: string | null;
  fintech_sourcing_search_terms: unknown;
  organization_id: string;
};

export async function loadOrganizationSettings(organizationId: string): Promise<OrganizationSettingsRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("organization_settings")
    .select("organization_id, default_scan_frequency, fintech_sourcing_search_terms")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load organization settings: ${error.message}`);
  }

  return (data as OrganizationSettingsRow | null) ?? null;
}

export async function upsertOrganizationSettings(
  organizationId: string,
  patch: Partial<Pick<OrganizationSettingsRow, "default_scan_frequency" | "fintech_sourcing_search_terms">>
): Promise<OrganizationSettingsRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("organization_settings")
    .upsert(
      {
        organization_id: organizationId,
        ...patch
      },
      {
        onConflict: "organization_id"
      }
    )
    .select("organization_id, default_scan_frequency, fintech_sourcing_search_terms")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to save organization settings: ${error.message}`);
  }

  return (data as OrganizationSettingsRow | null) ?? null;
}
