"use server";

import { redirect } from "next/navigation";
import { getQueueAvailability } from "../../lib/env";
import { getAdminScanThrottleMs } from "../../lib/scan-access";
import { normalizeScanFrom } from "@website-signal-risk-scanner/shared";
import { isPlatformAdminEmail } from "../admin/platform-admin";
import { getDashboardContext } from "../auth";
import { queueFullScanForDomain, type CreateFullScanActionState } from "./create-full-scan";
import {
  normalizeLocalV2DagRunViaLambda,
  normalizeLocalV2DagScanProfile
} from "./local-v2-dag-scan-config";

const initialState: CreateFullScanActionState = {
  error: null
};

export async function rescanDomainAction(
  _previousState: CreateFullScanActionState = initialState,
  formData: FormData
): Promise<CreateFullScanActionState> {
  const queueAvailability = getQueueAvailability();

  if (!queueAvailability.enabled) {
    return {
      error: queueAvailability.reason
    };
  }

  const dashboardContext = await getDashboardContext();
  const domainId = String(formData.get("domainId") ?? "").trim();
  const localV2DagScanProfile = normalizeLocalV2DagScanProfile(formData.get("localV2ScanProfile"));
  const scanFrom = normalizeScanFrom(formData.get("scanFrom"));
  const localV2DagRunViaLambda = normalizeLocalV2DagRunViaLambda(formData.get("localV2RunViaLambda"), process.env, scanFrom);

  if (domainId.length === 0) {
    return {
      error: "A domain is required to start a re-scan."
    };
  }

  const queueResult = await queueFullScanForDomain({
    domainId,
    organizationId: dashboardContext.organization.id,
    planCode: dashboardContext.organization.plan,
    submittedByUserId: dashboardContext.user.id,
    enforceCooldown: true,
    enforceMonthlyUsageLimit: true,
    localV2DagScanProfile,
    localV2DagRunViaLambda,
    scanFrom,
    scanThrottleMs: isPlatformAdminEmail(dashboardContext.user.email) ? getAdminScanThrottleMs() : undefined,
    source: "manual-rescan"
  });

  if (queueResult.error || !queueResult.scanId) {
    return {
      error: queueResult.error ?? "Could not queue re-scan."
    };
  }

  redirect(`/app/scans/${queueResult.scanId}`);
}
