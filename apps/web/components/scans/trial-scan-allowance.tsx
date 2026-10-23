import type { DashboardScanUsage } from "../../server/dashboard/get-dashboard-scan-usage";

type TrialScanAllowanceProps = {
  planCode: string;
  planStatus: string;
  usage: Pick<DashboardScanUsage, "monthlyLimit" | "monthlyScansUsed">;
};

/** Presentation only: use the existing quota read, including workspace overrides. */
export function TrialScanAllowance({ planCode, planStatus, usage }: TrialScanAllowanceProps) {
  if (planCode !== "free" || planStatus !== "active") return null;
  const remaining = usage.monthlyLimit === null ? null : Math.max(0, usage.monthlyLimit - usage.monthlyScansUsed);
  return (
    <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-950">
      {remaining === 0
        ? "You’ve used your current trial scan allowance."
        : <>{remaining === null ? "Your trial has scans available." : `Your trial has ${remaining} ${remaining === 1 ? "scan" : "scans"} remaining.`} No upgrade is needed to use your available scans.</>}
    </p>
  );
}
