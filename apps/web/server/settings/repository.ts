"use server";

import { queryOne } from "@website-signal-risk-scanner/db";

export type OrganizationSettingsRow = {
  default_scan_frequency: string | null;
  fintech_sourcing_search_terms: unknown;
  organization_id: string;
  show_signal_snapshot_fingerprinting: boolean;
  show_signal_snapshot_review_lenses: boolean;
  show_signal_snapshot_scan_interruption: boolean;
};

const ORGANIZATION_SETTINGS_COLUMNS = [
  "default_scan_frequency",
  "fintech_sourcing_search_terms",
  "show_signal_snapshot_review_lenses",
  "show_signal_snapshot_scan_interruption",
  "show_signal_snapshot_fingerprinting"
] as const;

type OrganizationSettingsColumn = (typeof ORGANIZATION_SETTINGS_COLUMNS)[number];

function hasPatchValue(
  patch: Partial<Pick<OrganizationSettingsRow, OrganizationSettingsColumn>>,
  column: OrganizationSettingsColumn
) {
  return Object.prototype.hasOwnProperty.call(patch, column);
}

export async function loadOrganizationSettings(organizationId: string): Promise<OrganizationSettingsRow | null> {
  try {
    return await queryOne<OrganizationSettingsRow>(
      `select organization_id,
              default_scan_frequency,
              fintech_sourcing_search_terms,
              show_signal_snapshot_review_lenses,
              show_signal_snapshot_scan_interruption,
              show_signal_snapshot_fingerprinting
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
  patch: Partial<Pick<OrganizationSettingsRow, OrganizationSettingsColumn>>
): Promise<OrganizationSettingsRow | null> {
  const columns = ORGANIZATION_SETTINGS_COLUMNS.filter((column) => hasPatchValue(patch, column));
  if (columns.length === 0) {
    return loadOrganizationSettings(organizationId);
  }

  const insertColumns = ["organization_id", ...columns];
  const insertPlaceholders = insertColumns.map((_, index) => `$${index + 1}`);
  const updateAssignments = columns.map((column) => `${column} = excluded.${column}`);
  const values = [organizationId, ...columns.map((column) => patch[column])];

  try {
    return await queryOne<OrganizationSettingsRow>(
      `insert into organization_settings (${insertColumns.join(", ")})
       values (${insertPlaceholders.join(", ")})
       on conflict (organization_id) do update
         set ${updateAssignments.join(", ")}
       returning organization_id,
                 default_scan_frequency,
                 fintech_sourcing_search_terms,
                 show_signal_snapshot_review_lenses,
                 show_signal_snapshot_scan_interruption,
                 show_signal_snapshot_fingerprinting`,
      values
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to save organization settings: ${message}`);
  }
}
