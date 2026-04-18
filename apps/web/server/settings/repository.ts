"use server";

import { queryOne } from "@website-signal-risk-scanner/db";

export type OrganizationSettingsRow = {
  default_scan_frequency: string | null;
  fintech_sourcing_search_terms: unknown;
  organization_id: string;
};

export async function loadOrganizationSettings(organizationId: string): Promise<OrganizationSettingsRow | null> {
  try {
    return await queryOne<OrganizationSettingsRow>(
      `select organization_id, default_scan_frequency, fintech_sourcing_search_terms
         from organization_settings
        where organization_id = $1`,
      [organizationId],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load organization settings: ${message}`);
  }
}

export async function upsertOrganizationSettings(
  organizationId: string,
  patch: Partial<Pick<OrganizationSettingsRow, "default_scan_frequency" | "fintech_sourcing_search_terms">>
): Promise<OrganizationSettingsRow | null> {
  try {
    return await queryOne<OrganizationSettingsRow>(
      `insert into organization_settings (organization_id, default_scan_frequency, fintech_sourcing_search_terms)
       values ($1, $2, $3)
       on conflict (organization_id) do update
         set default_scan_frequency = excluded.default_scan_frequency,
             fintech_sourcing_search_terms = excluded.fintech_sourcing_search_terms
       returning organization_id, default_scan_frequency, fintech_sourcing_search_terms`,
      [
        organizationId,
        patch.default_scan_frequency ?? null,
        patch.fintech_sourcing_search_terms ?? null
      ]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to save organization settings: ${message}`);
  }
}
