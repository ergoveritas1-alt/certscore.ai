import {readVisibleInventoryInDocument} from "./cmp-visible-inventory.js";
import { readPreferenceControlsInDocument } from "./cmp-preference-control-read.js";
import { readPrivacyLinkAccess } from "./privacy-link-access.js";
import { readOneTrustInventoryInDocument } from "./onetrust-preference-inventory.js";
import { parseNamedCmpPartnerDisclosure } from "@certscore/contracts";
import { captureCmpNameManifest } from "./cmp-inventory-manifest-capture.js";
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

/** One existing all-vendor DOM read. Configuration lookup uses own-data roots
 * and bounded prototype data methods, without getters or additional waits.
 * The optional OneTrust inventory reuses its registered read-only SDK call. */
export function readCmpScopeInventory(page: Page, definitions: KnownCmpDefinition[], captureOneTrustInventory = false) {
  const entries = definitions.map(d => ({ name: d.canonicalName, inventoryRoot: d.preferenceDialogBinding?.deferredRootSelector, bannerRoot: d.rejectLabelBoundNecessaryOnly?.bannerSelector, recipe: d.preferenceCategoryInventory, selector: d.preferenceScopeSelector ?? d.preferenceInspection?.entranceSelector ?? d.domSelectors!.join(","), path: d.configuredConsentCookiePath, domains: d.domains, configurationApi:d.passiveConfigurationApi }));
  const read = (nodes: Element[], entries: Array<{ name: string; inventoryRoot?: string; bannerRoot?: string; recipe?: KnownCmpDefinition["preferenceCategoryInventory"]; selector: string; path?: string; domains: readonly string[]; configurationApi?: string }>, readOneTrust?: () => ReturnType<typeof readOneTrustInventoryInDocument>, readControls?: typeof readPreferenceControlsInDocument, readLinks?: typeof readPrivacyLinkAccess, readInventory?: typeof readVisibleInventoryInDocument) => {
    const empty = { overflow: nodes.length > 1000, indices: [] as number[], configurationIndices:[] as number[], scopeStates: [] as Array<{ index: number; state: "visible" | "inactive" | "unverified" }>, revealed: false, runtimeIdentified: false, surface: undefined as { controls: ReturnType<typeof readPreferenceControlsInDocument>; links: ReturnType<typeof readPrivacyLinkAccess>; visibleInventory?: ReturnType<typeof readVisibleInventoryInDocument> } | undefined, oneTrustInventory: undefined as ReturnType<typeof readOneTrustInventoryInDocument>, configuredConsentCookies: [] as Array<{ version: "cmp_configured_cookie_identity.v1"; configurationPath: string; name: string }> };
    if (empty.overflow) return empty;
    const matched = entries.flatMap((entry, index) => nodes.some(node => node.ownerDocument === document && node.matches(entry.selector)) ? [index] : []);
    const deadline = performance.now() + 50;
    const states = new Map<Element, "visible" | "inactive" | "unverified">();
    for (const node of nodes) {
      let ancestor: Element | null = node, inactive = false;
      for (let depth = 0; ancestor && depth < 64 && performance.now() < deadline; depth++) {
        const style = getComputedStyle(ancestor);
        if (style.display === "none" || style.opacity === "0" || ancestor.matches('[aria-hidden="true" i], [inert]')) { inactive = true; break; }
        // A descendant may override inherited visibility. That is ambiguous,
        // unlike display:none or opacity:0 on a composed ancestor.
        if (style.visibility !== "visible") break;
        const root = ancestor.getRootNode();
        ancestor = ancestor.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
      if ((ancestor && !inactive) || performance.now() >= deadline) { states.set(node, "unverified"); continue; }
      const box = node.getBoundingClientRect();
      states.set(node, inactive ? "inactive" : ancestor || performance.now() >= deadline ? "unverified"
        : box.width > 0 && box.height > 0 ? "visible" : "unverified");
    }
    const scopeStates = matched.map(index => {
      const values = nodes.filter(node => node.ownerDocument === document && node.matches(entries[index]!.selector)).map(node => states.get(node));
      return { index, state: values.includes("visible") ? "visible" as const
        : values.every(value => value === "inactive") ? "inactive" as const : "unverified" as const };
    });
    // An inactive installed SDK must not make one verified visible CMP ambiguous.
    // Zero-sized, unfinished or inaccessible scopes remain ambiguous, not absent.
    const active = scopeStates.filter(scope => scope.state !== "inactive");
    const indices = active.length === 1 && active[0]!.state === "visible" ? [active[0]!.index] : matched;
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
    const configurationIndices=entries.flatMap((entry,index)=>{
      if(!entry.configurationApi)return [];
      let candidate:unknown=window;
      const parts=entry.configurationApi.split('.');
      for(const [position,part] of parts.entries()) {
        if(!candidate || (typeof candidate!=="object" && typeof candidate!=="function"))return [];
        let owner:object|null=candidate;
        let descriptor=Object.getOwnPropertyDescriptor(owner,part);
        // A documented SDK method may be a class-prototype data method. Only
        // the final registered method gets this bounded lookup; roots still
        // require own data properties, and a shadowing accessor fails closed.
        if(position===parts.length-1)for(let depth=0;!descriptor && owner && depth<4;depth++) {
          owner=Object.getPrototypeOf(owner);
          if(owner===Object.prototype || owner===Function.prototype)break;
          if(owner)descriptor=Object.getOwnPropertyDescriptor(owner,part);
        }
        if(!descriptor || !("value" in descriptor))return [];
        candidate=descriptor.value;
      }
      return typeof candidate==="function"?[index]:[];
    });
    const selected = indices.length === 0 ? configurationIndices : indices;
    const selectedNodes = indices.length === 1 ? nodes.filter(node => node.matches(entries[indices[0]!]!.selector)) : [];
    // Reuse the existing bounded readers in this single browser task. Multiple
    // roots remain ambiguous; hidden preference panels cannot prove visibility.
    const selectedEntry = indices.length === 1 ? entries[indices[0]!] : undefined;
    const roots = selectedEntry?.inventoryRoot ? selectedNodes.filter(node => node.matches(selectedEntry.inventoryRoot!)) : [];
    const banners = selectedEntry?.bannerRoot ? selectedNodes.filter(node => node.matches(selectedEntry.bannerRoot!)) : [];
    const root = roots.length === 1 ? roots[0] : roots.length > 1 ? undefined
      : banners.length === 1 ? banners[0] : banners.length > 1 ? undefined
      : selectedNodes.length === 1 ? selectedNodes[0] : undefined;
    const surface = root && entries[indices[0]!]!.name === "OneTrust" && readControls && readLinks ? {
      controls: readControls([...root.querySelectorAll('input[type="checkbox"], [role="switch"], [role="checkbox"]')], entries[indices[0]!]!.recipe),
      links: readLinks([...root.querySelectorAll('a[href]')], {}),
      visibleInventory: readInventory?.([...root.querySelectorAll('table, [role="table"], dl')]),
    } : undefined;
    const oneTrustInventory = selected.length === 1 && entries[selected[0]!]!.name === "OneTrust" && configurationIndices.includes(selected[0]!)
      ? readOneTrust?.() : undefined;
    return { ...empty, surface, oneTrustInventory, indices, configurationIndices, scopeStates, runtimeIdentified, revealed: (window as unknown as { __certscoreBorlabsPassiveReveal?: boolean }).__certscoreBorlabsPassiveReveal === true,
      configuredConsentCookies: path && typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value)
        ? [{ version: "cmp_configured_cookie_identity.v1" as const, configurationPath: path, name: value }] : [],
    };
  };
  // Reuse the existing bounded OneTrust parser in the same browser task. Other
  // callers retain scope-only behavior, and ambiguous/provider-mismatched scopes
  // never receive another CMP's configuration.
  const visibleInventory = captureOneTrustInventory ? readVisibleInventoryInDocument.toString() : "undefined";
  const controls = captureOneTrustInventory ? readPreferenceControlsInDocument.toString() : "undefined";
  const links = captureOneTrustInventory ? readPrivacyLinkAccess.toString() : "undefined";
  const inventory = captureOneTrustInventory
    ? `() => (${readOneTrustInventoryInDocument.toString()})(${parseNamedCmpPartnerDisclosure.toString()},${captureCmpNameManifest.toString()})`
    : "undefined";
  return page.locator(entries.map(entry => entry.selector).join(",")).evaluateAll<ReturnType<typeof read>, typeof entries>(
    new Function("nodes", "entries", `const __name = (fn) => fn; return (${read.toString()})(nodes, entries, ${inventory}, ${controls}, ${links}, ${visibleInventory});`) as (nodes: Element[], values: typeof entries) => ReturnType<typeof read>, entries);
}
