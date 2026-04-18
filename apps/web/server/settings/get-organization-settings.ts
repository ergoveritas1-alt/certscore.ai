"use server";

import { loadOrganizationSettings } from "./repository";

export async function getOrganizationSettings(organizationId: string): Promise<{
  defaultScanFrequency: string | null;
  organizationId: string;
} | null> {
  const settings = await loadOrganizationSettings(organizationId);
  if (!settings) {
    return null;
  }

  return {
    organizationId: settings.organization_id,
    defaultScanFrequency: settings.default_scan_frequency
  };
}
