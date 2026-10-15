import type { Page } from "playwright";

/** Read the already-loaded CookieYes configuration used by its audit-table
 * renderer. No fetch, getters, consent-store read, SDK mutation or opening API.
 * This is configuration evidence, not proof that the table was shown to visitors.
 * The caller must bind one registered CMP and the current document before/after.
 */
export function readCookieYesPreferenceInventory(page: Page) {
  return page.evaluate<ReturnType<typeof readCookieYesInventoryInDocument>>(`(() => { const __name = (fn) => fn; return (${readCookieYesInventoryInDocument.toString()})(); })()`);
}

/** Self-contained browser reader. Category references select cookie names;
 * active-language records must repeat the exact name before supplying detail.
 * Never derive a service, purpose or consent choice from a category/domain.
 */
export function readCookieYesInventoryInDocument() {
  const own = (value: unknown, key: string): unknown => {
    if (!value || typeof value !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  };
  const store = own(own(window, "cookieyes"), "_ckyStore");
  const categories = own(store, "_categories");
  if (!Array.isArray(categories)) return undefined;
  const language = own(store, "_language"), active = own(language, "_active"), languages = own(language, "_store");
  let localized: unknown;
  if (languages instanceof Map && typeof active === "string" && active.length <= 40) {
    localized = Map.prototype.get.call(languages, active);
  }
  const cookieText = own(localized, "cookies");
  const text = (value: unknown) => {
    if (typeof value !== "string" || value.length > 4096) return "";
    const parsed = new DOMParser().parseFromString(value, "text/html");
    parsed.querySelectorAll("script,style,template").forEach(node => node.remove());
    const result = (parsed.body.textContent ?? "").replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
    // CookieYes's stock unavailable-description text is not a declared purpose.
    if (/^(?:description is currently not available\.?|not available\.?|n\/?a)$/i.test(result)) return "";
    return result.slice(0, 240);
  };
  const declarations: Array<{ name: string; purpose: string; duration: string; source: "cmp_api_inventory" }> = [];
  let visited = 0, truncated = categories.length > 32, unresolved = false;
  for (let index = 0; index < Math.min(categories.length, 32); index++) {
    const category = own(categories, String(index)), slug = own(category, "slug"), cookies = own(category, "cookies");
    if (typeof slug !== "string" || !/^[a-z0-9_-]{1,80}$/i.test(slug) || !Array.isArray(cookies)) { unresolved = true; continue; }
    for (let cookieIndex = 0; cookieIndex < cookies.length; cookieIndex++) {
      if (visited >= 100) { truncated = true; break; }
      visited++;
      const name = own(own(cookies, String(cookieIndex)), "cookieID");
      if (typeof name !== "string" || !/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(name)) { unresolved = true; continue; }
      const detail = own(cookieText, name), bound = own(detail, "cookie_id") === name;
      const declaration = { name, purpose: bound ? text(own(detail, "description")) : "",
        duration: bound ? text(own(detail, "duration")) : "", source: "cmp_api_inventory" as const };
      if (!bound) unresolved = true;
      if (!declarations.some(row => row.name === name && row.purpose === declaration.purpose && row.duration === declaration.duration)) declarations.push(declaration);
    }
  }
  return { declarations, categories: [] as string[], services: [] as string[], truncated, unresolved,
    groupCount: Math.min(categories.length, 10000) };
}
