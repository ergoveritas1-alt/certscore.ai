/** Fields rendered by FullSiteWorkspace, ServiceResourceRows and their report disclosures.
 * Raw evidence/graph JSON viewers are separate diagnostics, not report table content.
 */
type Row = Record<string, any>;
const pick = (value: Row | null | undefined, keys: string): Row => Object.fromEntries(
  keys.split(' ').filter(key => value && Object.hasOwn(value, key)).map(key => [key, value![key]]),
);
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
function context(value: Row | undefined) {
  if (!value) return value;
  return { ...pick(value, 'identity provider headquarters transfer'), policy: value.policy && {
    ...pick(value.policy, 'status'),
    mentions: rows(value.policy.mentions).map(row => pick(row, 'url capturedAt scope excerpt')),
    reviewed: rows(value.policy.reviewed).map(row => pick(row, 'url complete capturedAt')),
  } };
}
function resource(row: Row) {
  const occurrence = row.occurrence;
  return {
    ...pick(row, 'key name kind pageIds purposes relationships eventCount inventoryEvidence destinations destinationAssessedCount destinationMissingCount destinationsTruncated relationshipCount serviceOnlyAdditional partialPageIds homepage'),
    ...(occurrence ? { name: row.name ?? occurrence.label, kind: row.kind ?? occurrence.kind, occurrence: { ...pick(occurrence, 'id kind label vendor domain firstSeenMs purpose relationship confidence'),
      ...(occurrence.details?.resourceRole ? { resourceRole: occurrence.details.resourceRole } : {}),
    } } : {}),
    ...(row.context ? { context: context(row.context) } : {}),
  };
}
function services(value: unknown, resourceRows: Row[] = [], path?: string) {
  return rows(value).map(row => ({ ...pick(row, 'key name pageIds purposes origins'),
    ...(row.context ? { context: context(row.context) } : {}),
    resources: rows(row.resources).map(item => {
      const index = resourceRows.findIndex(candidate => candidate.key === item.key);
      return path && index >= 0 ? { reportContentRef: `${path}/${index}` } : resource(item);
    }),
  }));
}
export function visibleResourceInventory(value: Row, resourcePath = "/resourceInventory/resources") {
  return { ...pick(value, 'requestMetric mix'), resources: rows(value.resources).map(resource), services: services(value.services, rows(value.resources), resourcePath) };
}
export function visibleFullSiteReport(value: Row) {
  const pages = rows(value.pages?.rows).filter(row => !['excluded', 'cancelled'].includes(row.status));
  return {
    ...pick(value, 'summary priorityTotals collectionSurfaces coverage inventoryMix charts'),
    ...(value.score ? { score: pick(value.score, 'value priorityReview scoredPages limitedPages evidencePages') } : {}),
    ...(value.pages ? { pages: { total: pages.length, rows: pages.map(row => pick(row,
      'id url finalUrl source status httpStatus services cookies requestEvents embedInstances additionalServices durationMs limitations limitation')) } } : {}),
    ...(value.resources ? { resources: { total: value.resources.total, rows: rows(value.resources.rows).map(resource) } } : {}),
    services: services(value.services, rows(value.resources?.rows), "/fullSiteReport/resources/rows"),
    pageChoices: rows(value.pageChoices).map(row => pick(row, 'id url source status limitation httpStatus')),
  };
}
