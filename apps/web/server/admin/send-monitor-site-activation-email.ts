"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createGmailTransport, getGmailConfig } from "../email/gmail";
import {
  loadAdminMonitorSiteRequestById,
  updateAdminMonitorSiteRequestSetup
} from "./repository";
import { buildMonitorSiteActivationEmailText } from "./monitor-site-activation-email";
import { requirePlatformAdminContext } from "./platform-admin";

const sendMonitorSiteActivationEmailSchema = z.object({
  requestId: z.string().uuid("Invalid monitor request.")
});

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export async function isMonitorSiteActivationEmailConfigured() {
  return getGmailConfig() !== null;
}

export async function sendMonitorSiteActivationEmailFormAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdminContext();
  const parsed = sendMonitorSiteActivationEmailSchema.parse({
    requestId: formData.get("requestId")
  });

  const request = await loadAdminMonitorSiteRequestById(parsed.requestId);
  if (!request) {
    throw new Error("Monitor request was not found.");
  }

  const setup = getRecord(request.metadata_json?.monitorSetup);
  const activeFrequency = getString(setup?.activeFrequency) ?? getString(setup?.requestedFrequency);
  const domainId = getString(setup?.domainId);
  const hostname = getString(setup?.hostname);
  const linkedAt = getString(setup?.linkedAt);
  const linkedByUserId = getString(setup?.linkedByUserId);
  const normalizedUrl = getString(setup?.normalizedUrl);
  const organizationId = getString(setup?.organizationId);
  const requestedFrequency = getString(setup?.requestedFrequency);
  const setupStatus = getString(setup?.setupStatus);
  const publicStatusToken = getString(request.metadata_json?.publicStatusToken);

  if (
    setupStatus !== "activated" ||
    !activeFrequency ||
    !domainId ||
    !hostname ||
    !linkedAt ||
    !linkedByUserId ||
    !normalizedUrl ||
    !organizationId ||
    !requestedFrequency
  ) {
    throw new Error("Monitor request must be activated before sending a confirmation email.");
  }

  const gmailConfig = getGmailConfig();
  if (!gmailConfig) {
    throw new Error("Monitor confirmation email is not configured.");
  }

  const sentAt = new Date().toISOString();
  const transporter = createGmailTransport(gmailConfig);

  await transporter.sendMail({
    from: `"CertScore.ai Monitoring" <${gmailConfig.fromEmail}>`,
    replyTo: process.env.CONTACT_SALES_TO_EMAIL?.trim() || gmailConfig.fromEmail,
    subject: `CertScore.ai monitoring setup confirmed for ${hostname}`,
    text: buildMonitorSiteActivationEmailText({
      activeFrequency,
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
        activatedAt: getString(setup?.activatedAt),
        activatedByUserId: getString(setup?.activatedByUserId),
        activeFrequency,
        confirmationEmailSentAt: sentAt,
        confirmationEmailSentByUserId: user.id,
        domainId,
        hostname,
        linkedAt,
        linkedByUserId,
        normalizedUrl,
        organizationId,
        requestedFrequency,
        setupStatus: "activated"
      }
    },
    status: "converted"
  });

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/monitor-requests");
  redirect("/app/admin/monitor-requests");
}
