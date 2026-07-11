import { NextResponse } from "next/server";
import { createDomainRequestSchema, normalizeScanFrom } from "@website-signal-risk-scanner/shared";
import { getCurrentUser, getDashboardContext } from "../../../../server/auth";
import { isBetterAuthConfigurationError } from "../../../../server/better-auth/env";
import { getPlanLimits } from "../../../../server/plans/get-plan-limits";
import { getRecentScanReuseEligibility } from "../../../../server/scans/recent-scan-reuse";
import {
  canUseRestrictedScanOptions,
  restrictScanFromForUser
} from "../../../../server/scans/restricted-scan-options";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain") ?? "";
  const parsed = createDomainRequestSchema.safeParse({ domain });

  if (!parsed.success) {
    return NextResponse.json(
      { hasRecentReusableScan: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    let dashboardContext = null;

    try {
      const user = await getCurrentUser();
      dashboardContext = user ? await getDashboardContext() : null;
    } catch (error) {
      if (!isBetterAuthConfigurationError(error)) {
        throw error;
      }
    }

    const allowRestrictedScanOptions = dashboardContext
      ? canUseRestrictedScanOptions({
          membershipRole: dashboardContext.membership.role,
          userEmail: dashboardContext.user.email
        })
      : false;
    const scanFrom = restrictScanFromForUser({
      canUseRestrictedScanOptions: allowRestrictedScanOptions,
      scanFrom: normalizeScanFrom(url.searchParams.get("scanFrom"))
    });
    const planLimits = await getPlanLimits(dashboardContext?.organization.plan ?? "free");
    const eligibility = await getRecentScanReuseEligibility({
      minPagesRequested: planLimits.maxPagesPerScan,
      normalizedDomain: parsed.data.hostname,
      normalizedUrl: parsed.data.normalizedUrl,
      organizationId: dashboardContext?.organization.id ?? null,
      scanFrom
    });

    return NextResponse.json(
      {
        effectiveScanFrom: eligibility.effectiveScanFrom,
        hasRecentReusableScan: eligibility.eligible,
        minPagesRequested: eligibility.minPagesRequested,
        reason: eligibility.eligible ? null : eligibility.reason,
        reuseWindowHours: eligibility.reuseWindowHours
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[full-scan-reuse-availability] recent scan lookup failed", {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { hasRecentReusableScan: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
