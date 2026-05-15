"use server";

import type { ScanFrequency } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  loadDomainMonitoringDomain,
  updateDomainScanFrequency
} from "../domains/repository";
import {
  loadAdminMonitorSiteRequestById,
  updateAdminMonitorSiteRequestSetup
} from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

const activateMonitorSiteSetupSchema = z.object({
  activationConfirmation: z.literal("confirmed", {
    errorMap: () => ({ message: "Confirm that monitoring setup is ready before activation." })
  }),
  activationNote: z.string().trim().max(500).optional().transform((value) => value || null),
  requestId: z.string().uuid("Invalid monitor request.")
});

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getFrequency(value: unknown): ScanFrequency | null {
  return value === "manual" || value === "daily" || value === "weekly" || value === "monthly" || value === "hourly"
    ? value
    : null;
}

export async function activateMonitorSiteSetupFormAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdminContext();
  const parsed = activateMonitorSiteSetupSchema.parse({
    activationConfirmation: formData.get("activationConfirmation"),
    activationNote: formData.get("activationNote"),
    requestId: formData.get("requestId")
  });

  const request = await loadAdminMonitorSiteRequestById(parsed.requestId);
  if (!request) {
    throw new Error("Monitor request was not found.");
  }

  const setup = getRecord(request.metadata_json?.monitorSetup);
  const domainId = getString(setup?.domainId);
  const hostname = getString(setup?.hostname);
  const linkedAt = getString(setup?.linkedAt);
  const linkedByUserId = getString(setup?.linkedByUserId);
  const normalizedUrl = getString(setup?.normalizedUrl);
  const organizationId = getString(setup?.organizationId);
  const requestedFrequency = getFrequency(setup?.requestedFrequency);

  if (!domainId || !hostname || !linkedAt || !linkedByUserId || !normalizedUrl || !organizationId || !requestedFrequency) {
    throw new Error("Monitor request has no prepared setup to activate.");
  }

  const domain = await loadDomainMonitoringDomain({
    domainId,
    organizationId
  });
  if (!domain) {
    throw new Error("Linked domain was not found in the selected workspace.");
  }

  await updateDomainScanFrequency({
    domainId,
    organizationId,
    scanFrequency: requestedFrequency
  });

  const activatedAt = new Date().toISOString();
  const previousFrequency = getFrequency(domain.scan_frequency);

  await updateAdminMonitorSiteRequestSetup({
    id: request.id,
    metadata: {
      monitorSetup: {
        activationConfirmedAt: activatedAt,
        activationConfirmedByUserId: user.id,
        activationNote: parsed.activationNote ?? undefined,
        activatedAt,
        activatedByUserId: user.id,
        activeFrequency: requestedFrequency,
        domainId,
        hostname,
        linkedAt,
        linkedByUserId,
        normalizedUrl,
        organizationId,
        previousFrequency,
        requestedFrequency,
        setupStatus: "activated"
      }
    },
    status: "converted"
  });

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/monitor-requests");
  revalidatePath("/app/domains");
  revalidatePath(`/app/domains/${domainId}`);
  redirect("/app/admin/monitor-requests");
}
