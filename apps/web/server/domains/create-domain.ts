"use server";

import { createHash } from "node:crypto";
import { createDomainRequestSchema, normalizeScanFrom, parseDomainBatchInput, type ScanFrom } from "@website-signal-risk-scanner/shared";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getQueueAvailability } from "../../lib/env";
import { getDashboardContext } from "../auth";
import {
  createOrganizationDomain,
  findOrganizationDomainByNormalizedUrl,
  loadDomainOrganizationAndSettings
} from "./repository";
import { checkDomainDns } from "./domain-dns";
import { getPlanLimits } from "../plans/get-plan-limits";
import { queueFullScanForDomain } from "../scans/create-full-scan";
import { isPlatformAdminEmail } from "../admin/platform-admin";
import { getAdminScanThrottleMs } from "../../lib/scan-access";
import {
  normalizeLocalV2DagRunViaLambda,
  normalizeLocalV2DagScanProfile,
  type LocalV2DagScanProfile
} from "../scans/local-v2-dag-scan-config";
import {
  canUseRestrictedScanOptions,
  restrictLocalV2RunViaLambdaForUser,
  restrictScanFromForUser
} from "../scans/restricted-scan-options";

export type CreateDomainActionState = {
  error: string | null;
  queuedCount?: number | null;
};

const initialState: CreateDomainActionState = {
  error: null,
  queuedCount: null
};

function getLocalAwareScanThrottleMs(userEmail: string): number | undefined {
  if (process.env.NODE_ENV !== "production") {
    return 0;
  }

  return isPlatformAdminEmail(userEmail) ? getAdminScanThrottleMs() : undefined;
}

export async function createOrQueueDomainScan(input: {
  allowExistingDomainRescan?: boolean;
  bypassRecentScanReuse?: boolean;
  domain: string;
  localV2DagLambdaDebugOverrides?: import("../scans/local-v2-dag-scan-config").LocalV2DagLambdaDebugOverrides | null;
  localV2DagScanProfile?: LocalV2DagScanProfile | null;
  localV2DagRunViaLambda?: boolean | null;
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
  scanFrom?: ScanFrom;
}) {
  const dashboardContext = await getDashboardContext();
  const allowRestrictedScanOptions = canUseRestrictedScanOptions({
    membershipRole: dashboardContext.membership.role,
    userEmail: dashboardContext.user.email
  });
  const parsedInput = createDomainRequestSchema.safeParse({
    domain: input.domain
  });

  if (!parsedInput.success) {
    return {
      error: parsedInput.error.issues[0]?.message ?? "Enter a valid website domain.",
      scanId: null
    };
  }

  const [planLimits, organizationSettingsAndOrg] = await Promise.all([
    getPlanLimits(dashboardContext.organization.plan),
    loadDomainOrganizationAndSettings(dashboardContext.organization.id)
  ]);
  const organizationSettings = organizationSettingsAndOrg.settings;
  const defaultScanFrom = restrictScanFromForUser({
    canUseRestrictedScanOptions: allowRestrictedScanOptions,
    scanFrom: input.scanFrom ?? (organizationSettings as { default_scan_from?: ScanFrom | null } | null)?.default_scan_from
  });
  const localV2DagRunViaLambda = restrictLocalV2RunViaLambdaForUser({
    canUseRestrictedScanOptions: allowRestrictedScanOptions,
    localV2DagRunViaLambda: input.localV2DagRunViaLambda
  });

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
      enforceMonthlyUsageLimit: true,
      provenance: input.provenance,
      bypassRecentScanReuse: input.bypassRecentScanReuse,
      localV2DagScanProfile: input.localV2DagScanProfile,
      localV2DagRunViaLambda,
      scanFrom: defaultScanFrom,
      scanThrottleMs: getLocalAwareScanThrottleMs(dashboardContext.user.email),
      source: "marketing-full-scan"
    });

    return {
      error: queueResult.error,
      reusedExistingScan: queueResult.reusedExistingScan,
      scanId: queueResult.scanId
    };
  }

  if (existingDomain) {
    return {
      error: "This domain is already connected to your workspace.",
      scanId: null
    };
  }

  const queueAvailability = getQueueAvailability();

  if (!queueAvailability.enabled) {
    return {
      error: queueAvailability.reason,
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
    bypassRecentScanReuse: input.bypassRecentScanReuse,
    localV2DagLambdaDebugOverrides: input.localV2DagLambdaDebugOverrides,
    localV2DagScanProfile: input.localV2DagScanProfile,
    localV2DagRunViaLambda,
    provenance: input.provenance,
    scanFrom: defaultScanFrom,
    scanThrottleMs: getLocalAwareScanThrottleMs(dashboardContext.user.email),
    source: "new-domain-overview"
  });

  return {
    error: queueResult.error,
    reusedExistingScan: queueResult.reusedExistingScan,
    scanId: queueResult.scanId
  };
}

export async function createDomainAction(
  _previousState: CreateDomainActionState = initialState,
  formData: FormData
): Promise<CreateDomainActionState> {
  const domainInput = String(formData.get("domain") ?? "");
  const forceNewScan = formData.get("forceNewScan") === "true";
  const localV2DagScanProfile = normalizeLocalV2DagScanProfile(formData.get("localV2ScanProfile"));
  const scanFrom = normalizeScanFrom(formData.get("scanFrom"));
  const localV2DagRunViaLambda = normalizeLocalV2DagRunViaLambda(formData.get("localV2RunViaLambda"), process.env, scanFrom);
  const parsedBatch = parseDomainBatchInput(domainInput);
  const requestHeaders = await headers();
  const originIp =
    requestHeaders.get("cf-connecting-ip")?.split(",").at(0)?.trim() ??
    requestHeaders.get("x-forwarded-for")?.split(",").at(0)?.trim() ??
    requestHeaders.get("x-real-ip")?.trim() ??
    null;
  const provenance = {
    host: requestHeaders.get("host"),
    originIp: originIp ? createHash("sha256").update(originIp).digest("hex") : null,
    userAgent: requestHeaders.get("user-agent")
  };

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
        allowExistingDomainRescan: true,
        bypassRecentScanReuse: forceNewScan,
        localV2DagScanProfile,
        localV2DagRunViaLambda,
        provenance,
        scanFrom
      })
    )
  );

  const queuedResults = results.filter((result) => !result.error && result.scanId);

  if (queuedResults.length === 0) {
    return {
      error: results.find((result) => result.error)?.error ?? "No scans could be queued."
    };
  }

  if (queuedResults.length === 1 && queuedResults[0]?.scanId) {
    redirect(`/app/scans/${queuedResults[0].scanId}`);
  }

  redirect("/app/scans");
}
