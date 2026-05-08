"use server";

import { createDomainRequestSchema, getPlanDefinition, parseDomainBatchInput } from "@website-signal-risk-scanner/shared";
import { redirect } from "next/navigation";
import { getQueueAvailability } from "../../lib/env";
import { getDashboardContext } from "../auth";
import {
  countOrganizationDomains,
  createOrganizationDomain,
  findOrganizationDomainByNormalizedUrl,
  loadDomainOrganizationAndSettings
} from "./repository";
import { checkDomainDns } from "./domain-dns";
import { getPlanLimits } from "../plans/get-plan-limits";
import { queueFullScanForDomain } from "../scans/create-full-scan";

export type CreateDomainActionState = {
  error: string | null;
  queuedCount?: number | null;
};

const initialState: CreateDomainActionState = {
  error: null,
  queuedCount: null
};

export async function createOrQueueDomainScan(input: {
  domain: string;
  allowExistingDomainRescan?: boolean;
  provenance?: {
    githubActor?: string | null;
    githubRunId?: string | null;
    githubSha?: string | null;
    githubWorkflow?: string | null;
    host?: string | null;
    originIp?: string | null;
    source?: string | null;
    userAgent?: string | null;
  };
}) {
  const queueAvailability = getQueueAvailability();

  if (!queueAvailability.enabled) {
    return {
      error: queueAvailability.reason,
      scanId: null
    };
  }

  const dashboardContext = await getDashboardContext();
  const parsedInput = createDomainRequestSchema.safeParse({
    domain: input.domain
  });

  if (!parsedInput.success) {
    return {
      error: parsedInput.error.issues[0]?.message ?? "Enter a valid website domain.",
      scanId: null
    };
  }

  const [planLimits, organizationSettingsAndOrg, domainCount] = await Promise.all([
    getPlanLimits(dashboardContext.organization.plan),
    loadDomainOrganizationAndSettings(dashboardContext.organization.id),
    countOrganizationDomains(dashboardContext.organization.id)
  ]);
  const planDefinition = getPlanDefinition(planLimits.planCode);
  const organizationSettings = organizationSettingsAndOrg.settings;

  const { hostname, normalizedUrl } = parsedInput.data;
  const dnsStatus = await checkDomainDns(hostname);

  if (!dnsStatus.exists) {
    return {
      error: dnsStatus.reason,
      scanId: null
    };
  }

  let existingDomain;
  try {
    existingDomain = await findOrganizationDomainByNormalizedUrl({
      normalizedUrl,
      organizationId: dashboardContext.organization.id
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to load existing domain.",
      scanId: null
    };
  }

  if (existingDomain && input.allowExistingDomainRescan) {
    const queueResult = await queueFullScanForDomain({
      domainId: existingDomain.id,
      organizationId: dashboardContext.organization.id,
      planCode: dashboardContext.organization.plan,
      submittedByUserId: dashboardContext.user.id,
      enforceCooldown: true,
      enforceMonthlyUsageLimit: false,
      provenance: input.provenance,
      source: "marketing-full-scan"
    });

    return {
      error: queueResult.error,
      scanId: queueResult.scanId
    };
  }

  if (existingDomain) {
    return {
      error: "This domain is already connected to your workspace.",
      scanId: null
    };
  }

  if (domainCount >= planLimits.maxDomains) {
    return {
      error:
        planLimits.planCode === "free"
          ? "You’ve reached the Free plan limit of 1 website."
          : `You’ve reached the ${planDefinition.label} plan domain limit of ${planLimits.maxDomains} domain${
              planLimits.maxDomains === 1 ? "" : "s"
            }.`,
      scanId: null
    };
  }

  let domain;
  try {
    domain = await createOrganizationDomain({
      hostname,
      normalizedUrl,
      organizationId: dashboardContext.organization.id,
      scanFrequency:
        ((organizationSettings as { default_scan_frequency: string | null } | null)?.default_scan_frequency as
          | string
          | null
          | undefined) ?? planLimits.scanFrequency
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not add domain.",
      scanId: null
    };
  }

  const queueResult = await queueFullScanForDomain({
    domainContext: {
      activeScanExists: false,
      domain: {
        hostname,
        id: domain.id,
        lastScannedAt: null,
        maxPagesOverride: null,
        normalizedUrl
      }
    },
    domainId: domain.id,
    organizationId: dashboardContext.organization.id,
    planCode: dashboardContext.organization.plan,
    planLimitsOverride: planLimits,
    submittedByUserId: dashboardContext.user.id,
    enforceMonthlyUsageLimit: true,
    provenance: input.provenance,
    source: "new-domain-overview"
  });

  return {
    error: queueResult.error,
    scanId: queueResult.scanId
  };
}

export async function createDomainAction(
  _previousState: CreateDomainActionState = initialState,
  formData: FormData
): Promise<CreateDomainActionState> {
  const domainInput = String(formData.get("domain") ?? "");
  const parsedBatch = parseDomainBatchInput(domainInput);

  if (parsedBatch.valid.length === 0) {
    return {
      error:
        parsedBatch.invalid[0]
          ? `Could not parse any valid domains from: ${parsedBatch.invalid[0]}`
          : "Enter at least one valid website domain."
    };
  }

  const results = await Promise.all(
    parsedBatch.valid.map((item) =>
      createOrQueueDomainScan({
        domain: item.domain,
        allowExistingDomainRescan: true
      })
    )
  );

  const queuedResults = results.filter((result) => !result.error && result.scanId);

  if (queuedResults.length === 0) {
    return {
      error: results.find((result) => result.error)?.error ?? "No scans could be queued."
    };
  }

  redirect("/app/scans");
}
