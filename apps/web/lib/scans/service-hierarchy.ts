import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { serviceIntegrationPurposes } from "./service-integration-group";
type Service = FullSiteReportResponse["services"][number];
export type ServiceBranch = { service: Service; collection?: boolean; directSite?: boolean; children: ServiceBranch[]; inferred: boolean; residual: boolean; ownResources: Service["resources"] };

// Policy over the canonical product identity, never hostname or display-name inference.
const requiresVerifiedOrigin = (service: Service) => service.context.identity?.product === "Google Fonts";

/** Nest only fully accounted-for resource identities. Unknown coverage stays visible. */
export function buildServiceHierarchy(services: Service[]): ServiceBranch[] {
  const byKey = new Map(services.map(service => [service.key, service]));
  const edges = new Map<string, Set<string>>();
  const assigned = new Map<string, Map<string, Service["resources"]>>();
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return [...(edges.get(from) ?? [])].some(key => reaches(key, target, seen));
  };
  for (const service of [...services].sort((a,b) => a.key.localeCompare(b.key))) {
    const groups = new Map<string, Service["resources"]>();
    for (const resource of service.resources) {
      const links = (service.origins ?? []).filter(link => link.resourceKey === resource.key);
      const parents = [...new Set(links.map(link => link.key))];
      let parent = "";
      const candidate = parents[0];
      if (parents.length === 1 && candidate && (candidate === "site:document" || byKey.has(candidate)) && !reaches(service.key, candidate)) {
        const occurrences = new Map(links.map(link => [JSON.stringify([link.pageId, link.occurrenceId]), link]));
        const count = [...occurrences.values()].reduce((sum, link) => sum + (link.eventCount ?? 0), 0);
        const verified = !requiresVerifiedOrigin(service) || links.every(link =>
          link.inferred === false && Boolean(link.nodeId) && Array.isArray(link.edgeIds) && link.edgeIds.length > 0 && link.edgeIds.every(Boolean) &&
          Boolean(link.occurrenceId) && Number.isSafeInteger(link.eventCount) && link.eventCount > 0 &&
          resource.pageIds.includes(link.pageId) && (candidate !== "site:document" || link.kind === "site") &&
          occurrences.get(JSON.stringify([link.pageId, link.occurrenceId]))?.eventCount === link.eventCount);
        if (verified && count === resource.eventCount && resource.pageIds.length > 0 && resource.pageIds.every(id => links.some(link => link.pageId === id))) parent = candidate;
      }
      groups.set(parent, [...(groups.get(parent) ?? []), resource]);
      if (parent && parent !== "site:document") edges.set(parent, new Set([...(edges.get(parent) ?? []), service.key]));
    }
    assigned.set(service.key, groups);
  }
  const make = (service: Service, parent: string, path: Set<string>): ServiceBranch => {
    const ownResources = assigned.get(service.key)?.get(parent) ?? [];
    const next = new Set([...path, service.key]);
    // Attach descendants once, to the service's standalone branch when one exists.
    const primaryParent = assigned.get(service.key)?.has("site:document") ? "site:document" : assigned.get(service.key)?.has("") ? "" : [...(assigned.get(service.key)?.keys() ?? [])][0];
    const children = parent === primaryParent ? services.filter(child => !next.has(child.key) && assigned.get(child.key)?.has(service.key)).map(child => make(child, service.key, next)) : [];
    const resources = [...new Map([...ownResources, ...children.flatMap(child => child.service.resources)].map(row => [row.key, row])).values()];
    return { directSite: parent === "site:document", service: {...service, purposes: serviceIntegrationPurposes(ownResources), resources, pageIds: [...new Set(resources.flatMap(row => row.pageIds))]}, ownResources, children,
      inferred: Boolean(parent) && (service.origins ?? []).some(link => link.key === parent && ownResources.some(row => row.key === link.resourceKey) && link.inferred),
      residual: !parent && Boolean(service.origins?.length), };
  };
  const roots = services.flatMap(service => {
    const branches = ["", "site:document"].filter(parent => assigned.get(service.key)?.has(parent)).map(parent => make(service, parent, new Set()));
    if (!service.context.identity || requiresVerifiedOrigin(service) || branches.length < 2) return branches;
    // Loading attribution partitions resources, not the service identity. Keep a
    // single identified root while retaining the original per-resource origins.
    // Verified branches beneath other services are intentionally left nested.
    const resources = [...new Map(branches.flatMap(branch => branch.service.resources).map(row => [row.key, row])).values()];
    return [{
      service: { ...service, purposes: serviceIntegrationPurposes(branches.flatMap(branch => branch.ownResources)), resources, pageIds: [...new Set(resources.flatMap(row => row.pageIds))] },
      ownResources: branches.flatMap(branch => branch.ownResources),
      children: branches.flatMap(branch => branch.children),
      directSite: false,
      residual: true,
      inferred: branches.some(branch => branch.inferred),
    }];
  });
  // Font identity alone cannot establish a standalone site integration. Preserve
  // unresolved resources separately, including when other font loads are verified.
  const other = roots.filter(branch => !branch.directSite && (!branch.service.context.identity || requiresVerifiedOrigin(branch.service)));
  const first = other[0];
  if (!first) return roots;
  const resources = [...new Map(other.flatMap(branch => branch.service.resources).map(row => [row.key, row])).values()];
  return [...roots.filter(branch => !other.includes(branch)), {
    collection: true, inferred: false, residual: false, ownResources: [], children: other,
    service: {...first.service, key: "collection:unattributed", name: "Other / unattributed resources", origins: [], resources,
      pageIds: [...new Set(resources.flatMap(row => row.pageIds))], purposes: [...new Set(resources.flatMap(row => row.purposes))]},
  }];
}

/** Count identities once across direct, child and unattributed resource branches. */
export function countHierarchyServices(branches: ServiceBranch[]): number {
  const keys = new Set<string>();
  const visit = (branch: ServiceBranch) => {
    if (!branch.collection && branch.service.context.identity) keys.add(branch.service.key);
    branch.children.forEach(visit);
  };
  branches.forEach(visit);
  return keys.size;
}
