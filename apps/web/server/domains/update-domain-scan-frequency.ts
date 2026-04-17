"use server";

import type { ScanFrequency } from "@website-signal-risk-scanner/shared";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "../auth";
import { updateDomainScanFrequency } from "./repository";

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

  await updateDomainScanFrequency({
    domainId: parsed.domainId,
    organizationId: organization.id,
    scanFrequency: parsed.scanFrequency
  });

  revalidatePath("/app/domains");
  revalidatePath(`/app/domains/${parsed.domainId}`);
}
