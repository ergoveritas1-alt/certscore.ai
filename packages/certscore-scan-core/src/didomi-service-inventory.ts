import { cmpSdkServiceInventorySchema, isExplicitCmpProviderName } from "@certscore/contracts";
import type { KnownCmpDefinition } from "@website-signal-risk-scanner/shared";
import type { Page } from "playwright";

/** One synchronous documented getter inside an already-ready callback.
 * No SDK loading, waiting, preferences UI, consent-state read or mutation.
 * https://developers.didomi.io/cmp/web-sdk/reference/api#getrequiredvendors */
export async function readPassiveDidomiServiceInventory(page: Page, definition: KnownCmpDefinition, documentToken: string) {
  const recipe = definition.passiveServiceInventory;
  if (definition.canonicalName !== "Didomi" || recipe?.version !== "didomi_required_vendors.v1") return undefined;
  // One atomic DOM/API read preserves identity without spending the passive
  // slice on repeated locator round trips. The caller verifies the loader.
  const raw = await page.evaluate(recipe => {
    const roots = document.querySelectorAll(recipe.rootSelector);
    if (roots.length !== 1) return undefined;
    const root = roots[0]!, notices = root.querySelectorAll(recipe.noticeSelector);
    if (notices.length !== 1) return undefined;
    const notice = notices[0]!;
    const helpers = {
      own(object: unknown, key: string): unknown {
        if (!object || (typeof object !== "object" && typeof object !== "function")) return undefined;
        const property = Object.getOwnPropertyDescriptor(object, key);
        return property && "value" in property ? property.value : undefined;
      },
      name(value: unknown) {
        if (typeof value !== "string" || value.length > 4096) return "";
        // The documented SDK name is text. Do not parse untrusted markup or
        // create a document that could load resources while sanitizing it.
        if (/[<>]/.test(value)) return "";
        const name = value.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
        return name.length <= 160 ? name : "";
      },
    };
    const api = helpers.own(window, "Didomi"), queue = helpers.own(window, "didomiOnReady");
    const getter = helpers.own(api, "getRequiredVendors");
    // After initialization the distributed SDK replaces the startup array
    // with its {stub:true, push(callback)} immediate-ready wrapper.
    const readyWrapper = queue && typeof queue === "object" && helpers.own(queue, "stub") === true;
    if (!api || typeof getter !== "function" || !Array.isArray(queue) && !readyWrapper) return undefined;
    const push = Object.getOwnPropertyDescriptor(queue, "push");
    const pushMethod = push ? "value" in push ? push.value : undefined : Object.getPrototypeOf(queue) === Array.prototype ? Array.prototype.push : undefined;
    if (typeof pushMethod !== "function") return undefined;
    const state = {open: true, ready: false};
    const witness = {onReady(readyApi: unknown) {if (state.open && readyApi === api) state.ready = true;}};
    try {pushMethod.call(queue, witness.onReady);} catch {return undefined;} finally {state.open = false;}
    // Late SDK readiness does not schedule a read or reopen this capture.
    if (!state.ready || helpers.own(window, "Didomi") !== api || helpers.own(window, "didomiOnReady") !== queue) return undefined;
    let vendors: unknown;
    try {vendors = getter.call(api);} catch {return undefined;}
    if (!Array.isArray(vendors) || vendors.length > 10000 || helpers.own(window, "Didomi") !== api ||
        helpers.own(api, "getRequiredVendors") !== getter || !root.isConnected || !notice.isConnected ||
        document.querySelectorAll(recipe.rootSelector).length !== 1 || document.querySelector(recipe.rootSelector) !== root ||
        root.querySelectorAll(recipe.noticeSelector).length !== 1 || root.querySelector(recipe.noticeSelector) !== notice) return undefined;
    const sourceRecordCount = vendors.length, inspectedRecordCount = Math.min(sourceRecordCount, 100);
    const candidates: Array<{id: string; name: string}> = [], seen = new Set<string>(), duplicateIds = new Set<string>();
    for (let index = 0; index < inspectedRecordCount; index++) {
      const vendor = helpers.own(vendors, String(index));
      const identity = helpers.own(vendor, "id");
      const id = typeof identity === "string" ? identity : typeof identity === "number" && Number.isInteger(identity) && identity > 0 && identity <= 65535 ? String(identity) : "";
      if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(id)) continue;
      if (seen.has(id)) duplicateIds.add(id);
      seen.add(id);
      const name = helpers.name(helpers.own(vendor, "name"));
      if (name) candidates.push({id, name});
    }
    let characters = 0, truncated = sourceRecordCount > inspectedRecordCount;
    const records = candidates.filter(record => {
      if (duplicateIds.has(record.id)) return false;
      const size = record.id.length + record.name.length;
      if (characters + size > 16000) {truncated = true; return false;}
      characters += size; return true;
    });
    if (helpers.own(window, "Didomi") !== api || helpers.own(window, "didomiOnReady") !== queue ||
        helpers.own(api, "getRequiredVendors") !== getter || !root.isConnected || !notice.isConnected ||
        document.querySelectorAll(recipe.rootSelector).length !== 1 || document.querySelector(recipe.rootSelector) !== root ||
        root.querySelectorAll(recipe.noticeSelector).length !== 1 || root.querySelector(recipe.noticeSelector) !== notice) return undefined;
    return {...recipe, getter: "Didomi.getRequiredVendors" as const, readiness: "already_ready_callback" as const,
      sourceRecordCount, inspectedRecordCount, unresolvedRecordCount: inspectedRecordCount - records.length, truncated, records};
  }, recipe);
  if (!raw) return undefined;
  const records = raw.records.filter(record => isExplicitCmpProviderName(record.name));
  return cmpSdkServiceInventorySchema.parse({...raw, documentToken, records, unresolvedRecordCount: raw.inspectedRecordCount - records.length});
}
