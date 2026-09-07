/** Display-only grouping. Never changes retained purposes or finding eligibility. */
export function inventoryPurposeLabel(purpose: string, relationships: readonly string[] = []): string {
  if (purpose.toLowerCase() !== "unknown") return purpose;
  const unique = [...new Set(relationships)];
  if (unique.length === 1 && unique[0] === "first_party") return "Unknown – 1st";
  if (unique.length === 1 && unique[0] === "third_party") return "Unknown – 3rd";
  return "Unknown";
}

export function inventoryPurposeTitle(label: string): string {
  if (label === "Unknown – 1st") return "Purpose unknown; first-party resource";
  if (label === "Unknown – 3rd") return "Purpose unknown; third-party resource";
  if (label.toLowerCase() === "unknown") return "Purpose unknown; site relationship unclear or mixed";
  return label;
}

export function inventoryPurposeGroups(purposes: readonly string[], relationships: readonly string[]): string[] {
  return (purposes.length ? purposes : ["unknown"]).map(purpose => inventoryPurposeLabel(purpose, relationships));
}
