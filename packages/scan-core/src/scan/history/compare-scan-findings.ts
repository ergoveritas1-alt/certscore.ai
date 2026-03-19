import { buildFindingComparisonKey } from "./build-finding-comparison-key";

export type ComparableFinding = {
  category: string;
  page_url: string | null;
  rule_key: string;
};

export function compareScanFindings(currentFindings: ComparableFinding[], previousFindings: ComparableFinding[]) {
  const currentMap = new Map(currentFindings.map((finding) => [buildFindingComparisonKey(finding), finding]));
  const previousMap = new Map(previousFindings.map((finding) => [buildFindingComparisonKey(finding), finding]));

  const newFindings = [...currentMap.entries()]
    .filter(([key]) => !previousMap.has(key))
    .map(([, finding]) => finding);
  const resolvedFindings = [...previousMap.entries()]
    .filter(([key]) => !currentMap.has(key))
    .map(([, finding]) => finding);
  const persistedFindings = [...currentMap.entries()]
    .filter(([key]) => previousMap.has(key))
    .map(([, finding]) => finding);

  return {
    newFindings,
    persistedFindings,
    resolvedFindings
  };
}
