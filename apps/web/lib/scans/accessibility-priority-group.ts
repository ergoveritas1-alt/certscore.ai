import { CERT_SCORE_FINDING_REGISTRY } from "./finding-registry";

export const ACCESSIBILITY_PRIORITY_GROUP_ID = "accessibility_priority_group";

type PriorityEntry = {
  id: string;
  rank: number;
  title: string;
  summary: string;
  evidence: string[];
  evidenceJson: Record<string, unknown>;
  correctionSteps: string[];
  pages?: Array<{ id: string; url: string; homepage: boolean }>;
};

/** Group already-selected presentation entries; never create eligibility from an audit. */
export function groupAccessibilityPriorityEntries<T extends PriorityEntry>(entries: T[]): T[] {
  const members = entries.filter(entry => CERT_SCORE_FINDING_REGISTRY[entry.id]?.section === "Accessibility");
  if (!members.length) return entries;
  const sourceIds = new Set(members.map(entry => entry.id));
  const pages = [...new Map(members.flatMap(entry => entry.pages ?? []).map(page => [page.id, page])).values()];
  const group: T = {
    ...members[0]!,
    id: ACCESSIBILITY_PRIORITY_GROUP_ID,
    title: "Accessibility issues",
    summary: "Review automated accessibility findings and retained examples in Detailed evidence.",
    evidence: members.map(entry => entry.title),
    evidenceJson: {
      presentationGroup: "accessibility",
      groupedFindingIds: members.map(entry => entry.id),
      findings: members,
    },
    correctionSteps: [...new Set(members.flatMap(entry => entry.correctionSteps).filter(step => step.trim()))],
    ...(members.some(entry => entry.pages !== undefined) ? { pages } : {}),
  };
  let included = false;
  return entries.flatMap(entry => {
    if (!sourceIds.has(entry.id)) return [entry];
    if (included) return [];
    included = true;
    return [group];
  }).map((entry, index) => ({ ...entry, rank: index + 1 }));
}
