"use server";

import type { ScanFrequency } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { loadDomainMonitoringDomain, updateDomainScanFrequency } from "../domains/repository";
import { createGmailTransport, getGmailConfig } from "../email/gmail";
import { buildMonitorSiteActivationEmailText } from "./monitor-site-activation-email";
import { requirePlatformAdminContext } from "./platform-admin";
import { loadAdminMonitorSiteRequestById, updateAdminMonitorSiteRequestSetup } from "./repository";

const completeMonitorSiteSetupSchema = z.object({
  setupConfirmation: z.literal("confirmed", {
    errorMap: () => ({ message: "Confirm that monitoring setup is ready before notifying the customer." })
  }),
  setupNote: z.string().trim().max(500).optional().transform((value) => value || null),
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

export async function completeMonitorSiteSetupFormAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdminContext();
  const parsed = completeMonitorSiteSetupSchema.parse({
    requestId: formData.get("requestId"),
    setupConfirmation: formData.get("setupConfirmation"),
    setupNote: formData.get("setupNote")
  });

  const gmailConfig = getGmailConfig();
  if (!gmailConfig) {
    throw new Error("Monitor confirmation email is not configured.");
  }

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
  const setupStatus = getString(setup?.setupStatus);
  const publicStatusToken = getString(request.metadata_json?.publicStatusToken);

  if (!domainId || !hostname || !linkedAt || !linkedByUserId || !normalizedUrl || !organizationId || !requestedFrequency) {
    throw new Error("Monitor request has no prepared setup to complete.");
  }

  if (setupStatus === "activated") {
    throw new Error("Monitor request setup has already been activated.");
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

  const completedAt = new Date().toISOString();
  const previousFrequency = getFrequency(domain.scan_frequency);
  const transporter = createGmailTransport(gmailConfig);
  const activatedSetup = {
    ...setup,
    activationConfirmedAt: completedAt,
    activationConfirmedByUserId: user.id,
    activationNote: parsed.setupNote ?? undefined,
    activatedAt: completedAt,
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
  };

  await updateAdminMonitorSiteRequestSetup({
    id: request.id,
    metadata: {
      monitorSetup: activatedSetup
    },
    status: "converted"
  });

  await transporter.sendMail({
    from: `"CertScore.ai Monitoring" <${gmailConfig.fromEmail}>`,
    replyTo: process.env.CONTACT_SALES_TO_EMAIL?.trim() || gmailConfig.fromEmail,
    subject: `CertScore.ai monitoring setup confirmed for ${hostname}`,
    text: buildMonitorSiteActivationEmailText({
      activeFrequency: requestedFrequency,
      appUrl: gmailConfig.appUrl,
      hostname,
      normalizedUrl,
      statusUrl: publicStatusToken ? `${gmailConfig.appUrl}/monitor-site/status/${encodeURIComponent(publicStatusToken)}` : null
    }),
    to: request.work_email
  });

  await updateAdminMonitorSiteRequestSetup({
    id: request.id,
    metadata: {
      monitorSetup: {
        ...activatedSetup,
        confirmationEmailSentAt: completedAt,
        confirmationEmailSentByUserId: user.id,
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
