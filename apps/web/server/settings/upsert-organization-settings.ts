"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "../auth";
import { upsertOrganizationSettings } from "./repository";

const settingsSchema = z.object({
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
  const parsed = settingsSchema.safeParse({
    defaultScanFrequency: formData.get("defaultScanFrequency") || ""
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
      default_scan_frequency: values.defaultScanFrequency || null
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
    success: "Monitoring settings saved."
  };
}
