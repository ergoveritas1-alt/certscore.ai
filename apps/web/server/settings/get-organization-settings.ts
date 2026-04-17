"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";

type SettingsRow = {
  default_scan_frequency: string | null;
  organization_id: string;
};

export async function getOrganizationSettings(organizationId: string): Promise<{
  defaultScanFrequency: string | null;
  organizationId: string;
} | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("organization_settings")
    .select("organization_id, default_scan_frequency")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load organization settings: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const settings = data as SettingsRow;
  return {
    organizationId: settings.organization_id,
    defaultScanFrequency: settings.default_scan_frequency
  };
}
