"use server";

import { queryOne } from "@website-signal-risk-scanner/db";

export type DashboardScanUsage = {
  accountCreatedAt: string;
  monthlyLimit: number | null;
  monthlyPeriodEnd: string;
  monthlyPeriodStart: string;
  monthlyScansUsed: number;
  remainingPercent: number | null;
  totalScans: number;
};

function getCurrentMonthWindow(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const periodStart = new Date(Date.UTC(year, month, 1));
  const periodEnd = new Date(Date.UTC(year, month + 1, 0));

  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10)
  };
}

export async function getDashboardScanUsage(input: {
  accountCreatedAt: string;
  monthlyLimit: number | null;
  organizationId: string;
}): Promise<DashboardScanUsage> {
  const monthWindow = getCurrentMonthWindow();
  const row = await queryOne<{
    monthly_scans_used: number;
    total_scans: number;
  }>(
    `select
       count(*) filter (
         where created_at >= $2::date
           and created_at < ($3::date + interval '1 day')
       )::int as monthly_scans_used,
       count(*)::int as total_scans
     from scans
     where organization_id = $1`,
    [input.organizationId, monthWindow.periodStart, monthWindow.periodEnd],
    { readOnly: true }
  );
  const monthlyScansUsed = row?.monthly_scans_used ?? 0;
  const monthlyLimit = input.monthlyLimit;
  const remainingPercent =
    typeof monthlyLimit === "number" && monthlyLimit > 0
      ? Math.max(0, Math.round(100 - (monthlyScansUsed / monthlyLimit) * 100))
      : null;

  return {
    accountCreatedAt: input.accountCreatedAt,
    monthlyLimit,
    monthlyPeriodEnd: monthWindow.periodEnd,
    monthlyPeriodStart: monthWindow.periodStart,
    monthlyScansUsed,
    remainingPercent,
    totalScans: row?.total_scans ?? 0
  };
}
