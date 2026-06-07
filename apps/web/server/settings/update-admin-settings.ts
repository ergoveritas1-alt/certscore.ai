"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminContext } from "../admin/platform-admin";
import { upsertOrganizationSettings } from "./repository";

export type UpdateAdminSettingsActionState = {
  error: string | null;
  success: string | null;
};

const initialAdminSettingsActionState: UpdateAdminSettingsActionState = {
  error: null,
  success: null
};

export async function updateAdminSettingsAction(
  _previousState: UpdateAdminSettingsActionState = initialAdminSettingsActionState,
  formData: FormData
): Promise<UpdateAdminSettingsActionState> {
  const { organization } = await requirePlatformAdminContext();

  try {
    await upsertOrganizationSettings(organization.id, {
      show_signal_snapshot_fingerprinting: formData.has("showSignalSnapshotFingerprinting"),
      show_signal_snapshot_review_lenses: formData.has("showSignalSnapshotReviewLenses"),
      show_signal_snapshot_scan_interruption: formData.has("showSignalSnapshotScanInterruption")
    });
  } catch (error) {
    return {
      error: error instanceof Error ? `Could not save admin settings: ${error.message}` : "Could not save admin settings.",
      success: null
    };
  }

  revalidatePath("/app/settings");
  revalidatePath("/app/scans/[scanId]", "page");

  return {
    error: null,
    success: "Admin settings saved."
  };
}
