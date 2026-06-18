"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { normalizeScanFrom } from "@website-signal-risk-scanner/shared";
import { getDashboardContext } from "../auth";
import { upsertOrganizationSettings } from "./repository";

const settingsSchema = z.object({
  defaultScanFrom: z.enum(["eu_de", "eu_ie", "california"]).optional(),
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
  const { organization } = await getDashboardContext();
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
      ...(values.defaultScanFrom ? { default_scan_from: normalizeScanFrom(values.defaultScanFrom) } : {}),
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
    success: "Settings saved."
  };
}
