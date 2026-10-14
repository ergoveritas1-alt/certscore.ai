import type { Page } from "playwright";

/** Documented read-only getter: https://developer.onetrust.com/onetrust/docs/javascript-api
 * Capture declared cookies, never infer services from hostnames or completeness
 * from a tenant configuration. No fetch, opening API, consent mutation or retry. */
export function readOneTrustPreferenceInventory(page: Page) {
  return page.evaluate(readOneTrustInventoryInDocument);
}

/** Self-contained for browser serialization. Bound work before returning values. */
export function readOneTrustInventoryInDocument() {
  const api = (window as unknown as { OneTrust?: { GetDomainData?: () => unknown } }).OneTrust;
  if (typeof api?.GetDomainData !== "function") return undefined;
  let data: unknown;
  try { data = api.GetDomainData(); } catch { return undefined; }
  if (!data || typeof data !== "object" || !Array.isArray((data as { Groups?: unknown }).Groups)) return undefined;
  const groups = (data as { Groups: unknown[] }).Groups;
  const categories: string[] = [], services: string[] = [];
  const declarations: Array<{ name: string; purpose: string; duration: string; source: "cmp_api_inventory" }> = [];
  let truncated = groups.length > 64, visited = 0;
  for (const value of groups.slice(0, 64)) {
    if (visited >= 100) { truncated = true; break; }
    if (!value || typeof value !== "object") continue;
    const group = value as { CustomGroupId?: unknown; GroupName?: unknown; FirstPartyCookies?: unknown; Hosts?: unknown };
    if (typeof group.CustomGroupId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(group.CustomGroupId)) continue;
    const rawLabel = typeof group.GroupName === "string" && group.GroupName.length <= 4096 ? group.GroupName : "";
    const label = (rawLabel.includes("<") ? new DOMParser().parseFromString(rawLabel, "text/html").body.textContent ?? "" : rawLabel).trim().slice(0, 240);
    if (label && !categories.includes(label)) categories.push(label);
    const lists: unknown[] = [group.FirstPartyCookies];
    if (Array.isArray(group.Hosts)) {
      if (group.Hosts.length > 100) truncated = true;
      for (const host of group.Hosts.slice(0, 100)) if (host && typeof host === "object") lists.push((host as { Cookies?: unknown }).Cookies);
    }
    for (const items of lists) {
      if (visited >= 100) { truncated = true; break; }
      if (!Array.isArray(items)) continue;
      if (items.length > 100) truncated = true;
      for (const cookie of items.slice(0, 100)) {
        if (++visited > 100 || declarations.length >= 100) { truncated = true; break; }
        if (!cookie || typeof cookie !== "object") continue;
        const row = cookie as { Name?: unknown; Description?: unknown; Lifespan?: unknown; IsSession?: unknown };
        if (typeof row.Name !== "string" || !/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(row.Name)) continue;
        const [purpose, rawDuration] = [row.Description, row.Lifespan].map(field => {
          if (typeof field !== "string" || field.length > 4096) return "";
          return (field.includes("<") ? new DOMParser().parseFromString(field, "text/html").body.textContent ?? "" : field).trim().slice(0, 240);
        });
        // A bare number has no verified unit. Preserve no invented duration.
        const duration = row.IsSession === true ? "Session" : /\p{L}/u.test(rawDuration!) ? rawDuration! : "";
        const declaration = { name: row.Name, purpose: purpose!, duration, source: "cmp_api_inventory" as const };
        if (!declarations.some(previous => previous.name === declaration.name && previous.purpose === declaration.purpose && previous.duration === declaration.duration)) declarations.push(declaration);
      }
    }
  }
  return { categories, services, declarations, truncated, groupCount: Math.min(groups.length, 10000) };
}
