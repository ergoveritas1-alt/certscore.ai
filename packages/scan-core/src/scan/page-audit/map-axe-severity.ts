import type { FindingSeverity } from "@website-signal-risk-scanner/shared";

export function mapAxeImpactToSeverity(impact: string | null | undefined): FindingSeverity {
  if (impact === "critical" || impact === "serious") {
    return "high";
  }

  if (impact === "moderate") {
    return "medium";
  }

  if (impact === "minor") {
    return "low";
  }

  return "info";
}

export function getSeverityWeight(severity: FindingSeverity): number {
  if (severity === "high") {
    return 10;
  }

  if (severity === "medium") {
    return 5;
  }

  if (severity === "low") {
    return 2;
  }

  return 0;
}
