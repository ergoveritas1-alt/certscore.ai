export function mapAxeImpactToSeverity(impact: string | null | undefined): "low" | "medium" | "high" | "critical" {
  const normalized = impact?.toLowerCase().trim() ?? "";
  switch (normalized) {
    case "critical":
      return "critical";
    case "serious":
      return "high";
    case "moderate":
      return "medium";
    case "minor":
      return "low";
    default:
      return "medium";
  }
}

export function mapAxeImpactToConfidence(
  impact: string | null | undefined,
  affectedNodeCount: number
): "strong" | "good" | "review" {
  const normalized = impact?.toLowerCase().trim() ?? "";

  if (normalized === "critical" || normalized === "serious") {
    return affectedNodeCount > 0 ? "strong" : "review";
  }

  if (normalized === "moderate" || normalized === "minor") {
    return affectedNodeCount > 0 ? "good" : "review";
  }

  return "review";
}
