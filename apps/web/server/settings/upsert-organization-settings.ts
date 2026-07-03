"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { normalizeScanFrom } from "@website-signal-risk-scanner/shared";
import { getDashboardContext } from "../auth";
import {
  canUseRestrictedScanOptions,
  restrictScanFromForUser
} from "../scans/restricted-scan-options";
import { upsertOrganizationSettings } from "./repository";

const settingsSchema = z.object({
  defaultScanFrom: z.enum(["eu_de", "eu_ie"]).optional(),
  defaultScanFrequency: z.enum(["manual", "hourly", "daily", "weekly", "monthly"]).optional().or(z.literal(""))
});

export type UpsertOrganizationSettingsActionState = {
  error: string | null;
  success: string | null;
};

const initialState: UpsertOrganizationSettingsActionState = {
  error: null,
  success: null
};

export async function upsertOrganizationSettingsAction(
  _previousState: UpsertOrganizationSettingsActionState = initialState,
  formData: FormData
): Promise<UpsertOrganizationSettingsActionState> {
  const { membership, organization, user } = await getDashboardContext();
  const allowRestrictedScanOptions = canUseRestrictedScanOptions({
    membershipRole: membership.role,
    userEmail: user.email
  });
  const hasDefaultScanFrequency = formData.has("defaultScanFrequency");
  const parsed = settingsSchema.safeParse({
    defaultScanFrom: formData.get("defaultScanFrom") || undefined,
    defaultScanFrequency: hasDefaultScanFrequency ? formData.get("defaultScanFrequency") || "" : undefined
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Could not save settings.",
      success: null
    };
  }

  const values = parsed.data;
  try {
    await upsertOrganizationSettings(organization.id, {
      ...(values.defaultScanFrom
        ? {
            default_scan_from: restrictScanFromForUser({
              canUseRestrictedScanOptions: allowRestrictedScanOptions,
              scanFrom: normalizeScanFrom(values.defaultScanFrom)
            })
          }
        : {}),
      ...(hasDefaultScanFrequency ? { default_scan_frequency: values.defaultScanFrequency || null } : {})
    });
  } catch (error) {
    return {
      error: error instanceof Error ? `Could not save organization settings: ${error.message}` : "Could not save organization settings.",
      success: null
    };
  }

  revalidatePath("/app/settings");
  return {
    error: null,
    success: "Last scan location saved."
  };
}
