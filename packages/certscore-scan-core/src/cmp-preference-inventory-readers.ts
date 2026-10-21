import type { Page, Locator } from "playwright";
import type { KnownCmpDefinition } from "@website-signal-risk-scanner/shared";
import { classifyConsentPreferenceControl } from "@certscore/contracts";
import { readPreferenceControlsInDocument } from "./cmp-preference-control-read.js";

/** Documented Borlabs v3 read APIs, with IDs from this document's configuration.
 * Source accounting can establish the configured-service cookie list, never
 * whole-site service coverage or available switches. Only captured visible controls establish choices. */
export async function readBorlabsPreferenceInventory(page: Page) {
  return page.evaluate(() => {
    type Service = { name?: string; serviceGroupId?: string; cookies?: Array<{ name?: string; purpose?: string; lifetime?: string }> };
    const target = window as unknown as {
      borlabsCookieConfig?: { services?: Record<string, { id?: string; serviceGroupId?: string }> };
      BorlabsCookie?: { Services?: { findByServiceId?: (id: string) => Service | undefined };
        ServiceGroups?: { findByServiceGroupId?: (id: string) => { name?: string } | undefined } };
    };
    const categories: string[] = [], services: string[] = [];
    const declarations: Array<{ name: string; purpose: string; duration: string; source: "cmp_api_inventory" }> = [];
    const configured = target.borlabsCookieConfig?.services;
    const coverage = { scope: "configured_services" as const, configured: 0, resolved: 0, unresolved: 0, truncated: false };
    let cookieInventoryComplete = true;
    if (!configured || typeof configured !== "object") return { categories, services, declarations, coverage, cookieInventoryComplete: false };
    const items = Object.entries(configured);
    coverage.configured = Math.min(items.length, 10000);
    coverage.truncated = items.length > 100;
    for (const [id, item] of items.slice(0, 100)) {
      if (!item || item.id !== id || typeof item.id !== "string" || item.id.length > 160) { coverage.unresolved++; cookieInventoryComplete = false; continue; }
      try {
        const service = target.BorlabsCookie?.Services?.findByServiceId?.(item.id);
        if (!service || service.serviceGroupId !== item.serviceGroupId) { coverage.unresolved++; cookieInventoryComplete = false; continue; }
        const name = typeof service.name === "string" ? service.name.trim().slice(0, 240) : "";
        if (name) { services.push(name); coverage.resolved++; }
        else coverage.unresolved++;
        const group = item.serviceGroupId && target.BorlabsCookie?.ServiceGroups?.findByServiceGroupId?.(item.serviceGroupId);
        if (group && typeof group.name === "string") categories.push(group.name.trim().slice(0, 240));
        if (!Array.isArray(service.cookies)) { cookieInventoryComplete = false; continue; }
        if (service.cookies.length > 100) cookieInventoryComplete = false;
        for (const cookie of service.cookies.slice(0, 100)) {
          if (declarations.length >= 100) { cookieInventoryComplete = false; break; }
          if (!cookie || typeof cookie.name !== "string" || !/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(cookie.name)) { cookieInventoryComplete = false; continue; }
          declarations.push({ name: cookie.name, purpose: typeof cookie.purpose === "string" ? cookie.purpose.slice(0, 240) : "",
            duration: typeof cookie.lifetime === "string" ? cookie.lifetime.slice(0, 240) : "", source: "cmp_api_inventory" });
        }
      } catch {
        // A failed cookie/group read cannot erase an already-resolved name or
        // count the same configured service twice.
        cookieInventoryComplete = false;
      }
    }
    coverage.unresolved = coverage.configured - coverage.resolved;
    return { categories: [...new Set(categories)], services: [...new Set(services)], declarations, coverage,
      cookieInventoryComplete: cookieInventoryComplete && coverage.configured > 0 && !coverage.truncated && !coverage.unresolved };
  });
}


export async function readPreferenceControls(controlled: Locator, recipe?: KnownCmpDefinition["preferenceCategoryInventory"], inputSelector?: string) {
  const selector = 'input[type="checkbox"], [role="switch"], [role="checkbox"]' + (recipe?.radioGroupSelector ? `, ${recipe.radioGroupSelector}` : "");
  return await controlled.locator(inputSelector ? `:is(${selector}):is(${inputSelector})` : selector).evaluateAll(readPreferenceControlsInDocument, recipe);
}

export function classifyControls(controls: Awaited<ReturnType<typeof readPreferenceControls>>["controls"], inventory?: { categories: string[]; services: string[] }) {
  return controls.filter(control => control.visible).map(({ label, groupLabel, enabled, checked, registeredCategory, registeredService }) => {
    const classified = classifyConsentPreferenceControl({ label, groupLabel });
    return {
      label, enabled, checked,
      kind: registeredService ? "service" as const : registeredCategory && classified !== "service" ? "category" as const
        : inventory?.categories.includes(label) && !inventory.services.includes(label) ? "category" as const
        : inventory?.services.includes(label) && !inventory.categories.includes(label) ? "service" as const
        : classified,
    };
  });
}
