import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { PlanCode, ScanFrequency } from "@website-signal-risk-scanner/shared";
import { getPlanDefinition } from "@website-signal-risk-scanner/shared";

export async function getDomainScanFrequency(input: {
  domainFrequency: string | null;
  organizationId: string;
  organizationPlan: PlanCode;
}): Promise<ScanFrequency> {
  if (input.domainFrequency && isScanFrequency(input.domainFrequency)) {
    return input.domainFrequency;
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organization_settings")
    .select("default_scan_frequency")
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  const settingsFrequency = (data as { default_scan_frequency: string | null } | null)?.default_scan_frequency;

  if (settingsFrequency && isScanFrequency(settingsFrequency)) {
    return settingsFrequency;
  }

  return getPlanDefinition(input.organizationPlan).scanFrequency;
}

function isScanFrequency(value: string): value is ScanFrequency {
  return value === "manual" || value === "hourly" || value === "daily" || value === "weekly" || value === "monthly";
}
