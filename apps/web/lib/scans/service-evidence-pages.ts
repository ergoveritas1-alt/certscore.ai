/** Production keeps its existing read budget; the full retained-page audit is local-only. */
export function serviceEvidencePageIds(input: {
  localAudit: boolean;
  pages: Array<{ id: string; observation: { runtimeGraph?: unknown } | null }>;
  displayedPageIds: string[];
  detailId?: string | null;
}) {
  return [...new Set([
    ...(input.localAudit ? input.pages.filter(page => page.observation?.runtimeGraph).map(page => page.id) : []),
    ...input.displayedPageIds,
    ...(input.detailId ? [input.detailId] : []),
  ].filter(Boolean))];
}
