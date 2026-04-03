"use server";

import { redirect } from "next/navigation";
import { getQueueAvailability } from "../../lib/env";
import { getDashboardContext } from "../auth";
import { queueFullScanForDomain, type CreateFullScanActionState } from "./create-full-scan";

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
    enforceMonthlyUsageLimit: false,
    source: "manual-rescan"
  });

  if (queueResult.error || !queueResult.scanId) {
    return {
      error: queueResult.error ?? "Could not queue re-scan."
    };
  }

  redirect(`/app/scans/${queueResult.scanId}`);
}
