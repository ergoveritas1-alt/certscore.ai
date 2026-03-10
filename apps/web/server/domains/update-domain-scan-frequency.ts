"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { ScanFrequency } from "@website-signal-risk-scanner/shared";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "../auth";

const schema = z.object({
  domainId: z.string().uuid("Invalid domain."),
  scanFrequency: z.enum(["manual", "hourly", "daily", "weekly", "monthly"])
});

export async function updateDomainScanFrequencyFormAction(formData: FormData): Promise<void> {
  const { organization } = await getDashboardContext();
  const parsed = schema.parse({
    domainId: formData.get("domainId"),
    scanFrequency: formData.get("scanFrequency")
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("domains")
    .update({
      scan_frequency: parsed.scanFrequency
    })
    .eq("organization_id", organization.id)
    .eq("id", parsed.domainId);

  if (error) {
    throw new Error(`Could not update domain scan frequency: ${error.message}`);
  }

  revalidatePath("/app/domains");
  revalidatePath(`/app/domains/${parsed.domainId}`);
}
