import type { Page } from "playwright";
import type { KnownCmpDefinition } from "@website-signal-risk-scanner/shared";

/** Prefer a registered first-layer container over its identifying button.
 * Axeptio's existing passive recipe binds the widget to its exact Close
 * control. This reads visible choices only; it never authorizes Close/Next. */
export function cmpInventoryScopeSelector(definition: KnownCmpDefinition): string {
  const passive = definition.initialOptionalOffCloseObservation;
  return definition.preferenceScopeSelector ?? definition.preferenceInspection?.entranceSelector ?? (passive
    ? `${passive.categoryContainerSelector}:has(${passive.submitSelector})`
    : definition.domSelectors!.join(","));
}

/** One existing all-vendor DOM read. Configuration lookup is bounded and uses
 * own data properties only: no getters, API calls, network, or additional wait. */
export function readCmpScopeInventory(page: Page, definitions: KnownCmpDefinition[]) {
  const entries = definitions.map(d => ({ selector: d.preferenceScopeSelector ?? d.preferenceInspection?.entranceSelector ?? d.domSelectors!.join(","), path: d.configuredConsentCookiePath, domains: d.domains }));
  return page.locator(entries.map(entry => entry.selector).join(",")).evaluateAll((nodes, entries) => {
    const empty = { overflow: nodes.length > 1000, indices: [] as number[], revealed: false, runtimeIdentified: false, configuredConsentCookies: [] as Array<{ version: "cmp_configured_cookie_identity.v1"; configurationPath: string; name: string }> };
    if (empty.overflow) return empty;
    const indices = entries.flatMap((entry, index) => nodes.some(node => node.ownerDocument === document && node.matches(entry.selector)) ? [index] : []);
    // A loaded SDK can precede its UI by seconds. This routing hint only keeps
    // the existing readiness allowance; it never identifies an actionable scope.
    const scripts = [...document.scripts].slice(0, 300).flatMap(script => {
      try { return script.src ? [new URL(script.src).hostname.toLowerCase()] : []; } catch { return []; }
    });
    const runtimeIdentified = entries.some(entry => entry.domains.some(domain =>
      scripts.some(host => host === domain || host.endsWith(`.${domain}`))));
    const path = indices.length === 1 ? entries[indices[0]!]!.path : undefined;
    let value: unknown = window;
    if (path && path.split(".").length <= 4) for (const key of path.split(".")) {
      if (!value || (typeof value !== "object" && typeof value !== "function")) { value = undefined; break; }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      value = descriptor && "value" in descriptor ? descriptor.value : undefined;
    }
    return { ...empty, indices, runtimeIdentified, revealed: (window as unknown as { __certscoreBorlabsPassiveReveal?: boolean }).__certscoreBorlabsPassiveReveal === true,
      configuredConsentCookies: path && typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value)
        ? [{ version: "cmp_configured_cookie_identity.v1" as const, configurationPath: path, name: value }] : [],
    };
  }, entries);
}
