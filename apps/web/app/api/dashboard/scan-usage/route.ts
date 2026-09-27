import { NextResponse } from "next/server";
import { getCurrentUser, getDashboardContext } from "../../../../server/auth";
import { getDashboardScanUsage } from "../../../../server/dashboard/get-dashboard-scan-usage";
import {
  applyManualRescanLimitOverride,
  getOrganizationManualRescanLimitOverride,
  getPlanLimits
} from "../../../../server/plans/get-plan-limits";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { membership, organization, profile, marketplaceBrowser } = await getDashboardContext();
  if (!organization || !membership || marketplaceBrowser) {
    return NextResponse.json({ error: "Scan usage unavailable" }, { status: 404 });
  }

  const [baseLimits, override] = await Promise.all([
    getPlanLimits(organization.plan),
    getOrganizationManualRescanLimitOverride(organization.id)
  ]);
  const limits = await applyManualRescanLimitOverride(baseLimits, override);
  const usage = await getDashboardScanUsage({
    accountCreatedAt: profile.created_at,
    monthlyLimit: limits.manualRescanLimitPerMonth,
    organizationId: organization.id
  });

  return NextResponse.json({
    monthlyLimit: usage.monthlyLimit,
    monthlyPeriodEnd: usage.monthlyPeriodEnd,
    monthlyScansUsed: usage.monthlyScansUsed
  }, { headers: { "Cache-Control": "private, no-store" } });
}
