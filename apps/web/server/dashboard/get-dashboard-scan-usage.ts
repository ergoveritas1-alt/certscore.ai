"use server";

import { queryOne } from "@website-signal-risk-scanner/db";
import { USAGE_METRIC_KEYS } from "@website-signal-risk-scanner/shared";

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
    counter_value: number | null;
    monthly_scans_used: number;
    total_scans: number;
  }>(
    `select
       (
         select value
           from usage_counters
          where organization_id = $1
            and metric_key = $4
            and period_start = $2::date
            and period_end = $3::date
          limit 1
       ) as counter_value,
       coalesce(sum(greatest(pages_requested, 1)) filter (
         where scan_type in ('full', 'scheduled')
           and created_at >= $2::date
           and created_at < ($3::date + interval '1 day')
       ), 0)::int as monthly_scans_used,
       count(*)::int as total_scans
     from scans
     where organization_id = $1`,
    [input.organizationId, monthWindow.periodStart, monthWindow.periodEnd, USAGE_METRIC_KEYS.manualFullScans],
    { readOnly: true }
  );
  const monthlyScansUsed = Math.max(row?.monthly_scans_used ?? 0, row?.counter_value ?? 0);
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
