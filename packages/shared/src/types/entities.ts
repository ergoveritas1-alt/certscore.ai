export type PlanCode = "free" | "individual" | "pro" | "team";
export type PlanStatus = "active" | "trialing" | "past_due" | "paused";
export type ScanType = "preview" | "full" | "scheduled";
export type ScanStatus = "queued" | "running" | "completed" | "failed";
export type ScanFrequency = "manual" | "hourly" | "daily" | "weekly" | "monthly";
export type ScanProfile = "homepage" | "standard" | "team";
export type FindingCategory = "accessibility" | "privacy" | "legal";
export type FindingSeverity = "high" | "medium" | "low" | "info";

export type FindingRecord = {
  category: FindingCategory;
  ruleKey: string;
  severity: FindingSeverity;
  weight: number;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  remediationBusiness?: string;
  remediationTechnical?: string;
};
