"use server";

import { loadOrganizationSettings } from "./repository";

export type DefaultScanFromSetting = "eu_de" | "eu_ie";

function normalizeDefaultScanFrom(value: unknown): DefaultScanFromSetting {
  if (value === "eu_de") {
    return value;
  }

  return "eu_ie";
}

export async function getOrganizationSettings(organizationId: string): Promise<{
  defaultScanFrom: DefaultScanFromSetting;
  defaultScanFrequency: string | null;
  organizationId: string;
  showSignalSnapshotFingerprinting: boolean;
  showSignalSnapshotReviewLenses: boolean;
  showSignalSnapshotScanInterruption: boolean;
} | null> {
  const settings = await loadOrganizationSettings(organizationId);
  if (!settings) {
    return null;
  }

  return {
    organizationId: settings.organization_id,
    defaultScanFrom: normalizeDefaultScanFrom(settings.default_scan_from),
    defaultScanFrequency: settings.default_scan_frequency,
    showSignalSnapshotFingerprinting: settings.show_signal_snapshot_fingerprinting,
    showSignalSnapshotReviewLenses: settings.show_signal_snapshot_review_lenses,
    showSignalSnapshotScanInterruption: settings.show_signal_snapshot_scan_interruption
  };
}
