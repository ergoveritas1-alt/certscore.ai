import {captureCmpNameManifest} from "./cmp-inventory-manifest-capture.js";
import type { Page } from "playwright";
import { parseNamedCmpPartnerDisclosure } from "@certscore/contracts";

/** Documented read-only getter: https://developer.onetrust.com/onetrust/docs/javascript-api
 * Named fields follow OneTrust's own SDK (202507.1.0): VendorServices.ServiceName,
 * linked GeneralVendors.Name, and Hosts.DisplayName. A bare host is not a service.
 * SDK 202604.2.0 renders cookie `description` and derives duration from Length
 * (days) / DurationType (1, 7, 30, 365). Host Description is not cookie purpose.
 * No fetch, opening API, consent mutation, retry or second browser evaluation. */
export function readOneTrustPreferenceInventory(page: Page) {
  // tsx names nested helpers; keep its helper local to this serialized read.
  return page.evaluate<ReturnType<typeof readOneTrustInventoryInDocument>>(`(() => { const __name = (fn) => fn; return (${readOneTrustInventoryInDocument.toString()})(${parseNamedCmpPartnerDisclosure.toString()},${captureCmpNameManifest.toString()}); })()`);
}

/** Self-contained for browser serialization. One shared 100-record allowance
 * replaces the previous per-group host loops; nested groups share a 64-node cap. */
export function readOneTrustInventoryInDocument(readDisclosure?: typeof parseNamedCmpPartnerDisclosure,readManifest?:typeof captureCmpNameManifest) {
  const api = (window as unknown as { OneTrust?: { GetDomainData?: () => unknown } }).OneTrust;
  if (typeof api?.GetDomainData !== "function") return undefined;
  let data: unknown;
  try { data = api.GetDomainData(); } catch { return undefined; }
  if (!data || typeof data !== "object" || !Array.isArray((data as { Groups?: unknown }).Groups)) return undefined;
  type Row = Record<string, unknown>;
  const root = data as { Groups: unknown[]; GeneralVendors?: unknown; LfSpanSecs?: unknown };
  const categories: string[] = [];
  const declarations: Array<{ name: string; purpose: string; duration: string; source: "cmp_api_inventory" }> = [];
  const groups: Row[] = [], seenGroups = new Set<object>();
  const queue = root.Groups.slice(0, 64);
  // The registered banner's literal counted partner list is a separate source
  // from configured vendors. No page-body search, name registry or new read.
  const disclosureNodes = typeof document === "undefined" ? [] : document.querySelectorAll("#onetrust-banner-sdk #onetrust-policy-text");
  const disclosureNode = disclosureNodes.length === 1 ? disclosureNodes[0] : null;
  let visible = Boolean(disclosureNode?.getClientRects().length);
  let ancestor = disclosureNode;
  for (let depth = 0; ancestor && depth < 16; depth++, ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.visibility !== "visible" || style.display === "none" || style.opacity === "0") visible = false;
  }
  if (ancestor) visible = false;
  const disclosure = visible ? readDisclosure?.((disclosureNode as HTMLElement).innerText) : undefined;
  const serviceDisclosures = disclosure ? [disclosure] : [];
  let truncated = root.Groups.length > 64, visited = disclosure?.names.length ?? 0, serviceRecords = visited;
  const text = (raw: unknown) => {
    if (typeof raw !== "string" || raw.length > 4096) return "";
    if (raw.includes("<")) {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      doc.querySelectorAll("script,style,template").forEach(node => node.remove());
      raw = doc.body.textContent ?? "";
    }
    return (raw as string).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240);
  };
  // Cookie-level fields only. Conflicting aliases remain unresolved, and a
  // host/category description can never fill a missing cookie description.
  const cookiePurpose = (row: Row) => {
    const current = text(row.description), legacy = text(row.Description);
    return current && legacy && current !== legacy ? "" : current || legacy;
  };
  const cookieDuration = (row: Row) => {
    if (row.IsSession === true) return "Session";
    const explicit = text(row.Lifespan);
    // Preserve the existing explicit-unit source. Numeric strings alone do not
    // establish a unit; no parseInt coercion or SDK rounding is used here.
    if (/\p{L}/u.test(explicit)) return explicit;
    if (row.IsSession !== false) return "";
    const raw = row.Length;
    const days = typeof raw === "number" ? raw
      : typeof raw === "string" && /^(?:0|[1-9]\d{0,6})(?:\.\d{1,6})?$/.test(raw) ? Number(raw) : NaN;
    const type = row.DurationType;
    if (!Number.isFinite(days) || days < 0 || days > 1_000_000 ||
        (type !== 1 && type !== 7 && type !== 30 && type !== 365)) return "";
    // Zero is rendered with the configured SDK duration label, not as zero
    // days. If that label is missing, keep the duration unknown.
    if (days === 0) return text(root.LfSpanSecs);
    const unit = type === 365 ? "year" : type === 30 ? "month" : type === 7 ? "week" : "day";
    // Length is already in days. Use the declared display unit only for an exact
    // multiple; otherwise retain exact days instead of inventing a rounded life.
    const count = days / type;
    return Number.isInteger(count) ? `${count} ${unit}${count === 1 ? "" : "s"}` : `${days} day${days === 1 ? "" : "s"}`;
  };
  const id = (raw: unknown) => typeof raw === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(raw) ? raw : "";
  // Preserve cookie breadth on vendor-heavy tenants, without enlarging the
  // shared allowance. Small service lists leave the rest available to cookies.
  const take = (service: boolean) => {
    if (visited >= 100 || (service && serviceRecords >= 80)) { truncated = true; return false; }
    visited++; if (service) serviceRecords++; return true;
  };
  // Iterative traversal tolerates cycles without a recursive/unbounded walk.
  for (let index = 0; index < queue.length && index < 64; index++) {
    const value = queue[index];
    if (!value || typeof value !== "object" || seenGroups.has(value)) continue;
    seenGroups.add(value);
    const group = value as Row;
    if (!id(group.CustomGroupId)) continue;
    groups.push(group);
    if (Array.isArray(group.SubGroups)) {
      const room = 64 - queue.length;
      if (group.SubGroups.length > room) truncated = true;
      queue.push(...group.SubGroups.slice(0, room));
    }
  }
  // Only linked general vendors belong to these inspected groups. Never read
  // an IAB/global vendor list or turn every available vendor into a declaration.
  const vendors = new Map<string, Row | null>();
  if (Array.isArray(root.GeneralVendors)) {
    if (root.GeneralVendors.length > 100) truncated = true;
    for (const value of root.GeneralVendors.slice(0, 100)) {
      if (!value || typeof value !== "object") continue;
      const row = value as Row, key = id(row.VendorCustomId);
      if (key) vendors.set(key, vendors.has(key) ? null : row);
    }
  }
  const manifestLists:unknown[]=[];
  let invalidSources=truncated || groups.length!==queue.length ? 1 : 0;
  for(const group of groups) {
    if(group.FirstPartyCookies!==undefined) manifestLists.push(group.FirstPartyCookies);
    if(group.Hosts!==undefined && !Array.isArray(group.Hosts)) invalidSources++;
    if(Array.isArray(group.Hosts)) {
      if(group.Hosts.length>100) invalidSources++;
      for(const host of group.Hosts.slice(0,100)) {
        if(host && typeof host==="object" && (host as Row).Cookies!==undefined) manifestLists.push((host as Row).Cookies);
        else if(!host || typeof host!=="object") invalidSources++;
      }
    }
  }
  const inventoryManifest=readManifest?.(manifestLists,"Name","onetrust_group_cookie_lists.v1",invalidSources);
  const names = new Map<string, string>();
  const remember = (key: string, name: string) => {
    if (names.has(key) && names.get(key) !== name) names.set(key, "");
    else if (!names.has(key)) names.set(key, name);
  };
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]!;
    const label = text(group.GroupName);
    if (label && !categories.includes(label)) categories.push(label);
    if (Array.isArray(group.VendorServices)) {
      if (group.VendorServices.length > 100) truncated = true;
      for (const [position, value] of group.VendorServices.slice(0, 100).entries()) {
        if (!take(true)) break;
        const row = value && typeof value === "object" ? value as Row : {};
        const key = id(row.CustomVendorServiceId);
        remember(`service:${key || `unresolved-${index}-${position}`}`, key ? text(row.ServiceName) : "");
      }
    }
    if (Array.isArray(group.GeneralVendorsIds)) {
      if (group.GeneralVendorsIds.length > 100) truncated = true;
      for (const [position, value] of group.GeneralVendorsIds.slice(0, 100).entries()) {
        if (!take(true)) break;
        const key = id(value), row = vendors.get(key);
        remember(`vendor:${key || `unresolved-${index}-${position}`}`, row ? text(row.Name) : "");
      }
    }
    const lists: unknown[] = [group.FirstPartyCookies];
    if (Array.isArray(group.Hosts)) {
      if (group.Hosts.length > 100) truncated = true;
      for (const [position, value] of group.Hosts.slice(0, 100).entries()) {
        if (!take(true)) break;
        if (!value || typeof value !== "object") continue;
        const row = value as Row, key = id(row.HostId), name = text(row.DisplayName);
        // Explicit display labels only. Domains, URLs, cookie names, synthetic
        // first-party group headings and registry guesses cannot name a service.
        const named = key && name &&
          !/^(?:https?:\/\/|[*.]*[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+(?:[/:?#]|$)|localhost(?:[/:?#]|$))/iu.test(name.replace(/\.$/, "")) &&
          !/[@/\\:?#]/.test(name);
        if (key) remember(`host:${key}`, named ? name : "");
        else if (name) remember(`host:unresolved-${index}-${position}`, "");
        lists.push(row.Cookies);
      }
    }
    for (const items of lists) {
      if (!Array.isArray(items)) continue;
      if (items.length && visited >= 100) { truncated = true; break; }
      if (items.length > 100) truncated = true;
      for (const cookie of items.slice(0, 100)) {
        if (!take(false)) break;
        if (!cookie || typeof cookie !== "object") continue;
        const row = cookie as Row;
        if (typeof row.Name !== "string" || !/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(row.Name)) continue;
        const purpose = cookiePurpose(row), duration = cookieDuration(row);
        const declaration = { name: row.Name, purpose, duration, source: "cmp_api_inventory" as const };
        if (!declarations.some(previous => previous.name === declaration.name && previous.purpose === declaration.purpose && previous.duration === declaration.duration)) declarations.push(declaration);
      }
    }
  }
  const resolved = [...names.values()].filter(Boolean).length;
  return { configurationVersion: "onetrust_loaded_configuration.v4" as const, categories, services: [...new Set([...names.values()].filter(Boolean))], serviceDisclosures, declarations, truncated,
    groupCount: Math.min(root.Groups.length + Math.max(0, groups.length - root.Groups.length), 10000),
    ...(inventoryManifest ? {inventoryManifest} : {}),
    coverage: { scope: "configured_services" as const, configured: names.size, resolved, unresolved: names.size - resolved, truncated } };
}
