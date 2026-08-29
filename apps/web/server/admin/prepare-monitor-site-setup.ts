"use server";

import { createDomainRequestSchema } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createOrganizationDomain,
  findOrganizationDomainByNormalizedUrl,
  loadDomainOrganizationAndSettings
} from "../domains/repository";
import {
  loadAdminMonitorSiteRequestById,
  updateAdminMonitorSiteRequestSetup
} from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";
import { requireDomainDns } from "../domains/domain-dns";

const prepareMonitorSiteSetupSchema = z.object({
  organizationId: z.string().uuid("Choose a workspace."),
  requestId: z.string().uuid("Invalid monitor request."),
  requestedFrequency: z.enum(["manual", "daily", "weekly", "monthly"])
});

export async function prepareMonitorSiteSetupFormAction(formData: FormData): Promise<void> {
  const { user } = await requirePlatformAdminContext();
  const parsed = prepareMonitorSiteSetupSchema.parse({
    organizationId: formData.get("organizationId"),
    requestId: formData.get("requestId"),
    requestedFrequency: formData.get("requestedFrequency")
  });

  const request = await loadAdminMonitorSiteRequestById(parsed.requestId);
  if (!request) {
    throw new Error("Monitor request was not found.");
  }

  const parsedDomain = createDomainRequestSchema.safeParse({
    domain: request.website
  });
  if (!parsedDomain.success) {
    throw new Error("Monitor request website could not be normalized for setup.");
  }
  await requireDomainDns(parsedDomain.data.hostname);

  const organizationState = await loadDomainOrganizationAndSettings(parsed.organizationId);
  if (!organizationState.organization) {
    throw new Error("Workspace was not found.");
  }

  let domain = await findOrganizationDomainByNormalizedUrl({
    normalizedUrl: parsedDomain.data.normalizedUrl,
    organizationId: parsed.organizationId
  });

  if (!domain) {
    domain = await createOrganizationDomain({
      hostname: parsedDomain.data.hostname,
      normalizedUrl: parsedDomain.data.normalizedUrl,
      organizationId: parsed.organizationId,
      scanFrequency: "manual"
    });
  }

  const setupMetadata = {
    monitorSetup: {
      domainId: domain.id,
      hostname: parsedDomain.data.hostname,
      linkedAt: new Date().toISOString(),
      linkedByUserId: user.id,
      normalizedUrl: parsedDomain.data.normalizedUrl,
      organizationId: parsed.organizationId,
      requestedFrequency: parsed.requestedFrequency,
      setupStatus: "pending_setup"
    }
  };

  await updateAdminMonitorSiteRequestSetup({
    id: request.id,
    metadata: setupMetadata,
    status: "converted"
  });

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/monitor-requests");
  revalidatePath("/app/domains");
  revalidatePath(`/app/domains/${domain.id}`);
  redirect("/app/admin/monitor-requests");
}
