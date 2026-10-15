import type { ElementHandle, Locator, Page } from "playwright";
import type { KnownCmpDefinition } from "@website-signal-risk-scanner/shared";

type Recipe = NonNullable<KnownCmpDefinition["preferencePortalBinding"]>;

/** Reviewed SDK portals are siblings of the banner, not children. Bind the
 * exact original trigger/root and SDK object before the sole Options action.
 * No SDK methods/getters, arbitrary modal selection, or consent actions. */
export async function preparePreferencePortal(page: Page, control: Locator, recipe: Recipe) {
  const root = page.locator(recipe.rootSelector);
  if (await root.count() !== 1 || await page.locator(recipe.panelSelector).count() !== 0) return null;
  const rootHandle = await root.elementHandle();
  const controlHandle = await control.elementHandle();
  if (!rootHandle || !controlHandle) return null;
  const sdk = await page.evaluateHandle(path => {
    let value: unknown = window;
    for (const key of path) {
      if (!value || !["object", "function"].includes(typeof value)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      value = descriptor && "value" in descriptor ? descriptor.value : null;
    }
    return value && ["object", "function"].includes(typeof value) ? value : null;
  }, recipe.sdkPath);
  const valid = await control.evaluate((element, expected) => {
    if (!expected.sdk || !expected.root.isConnected || !element.matches(expected.selector)) return false;
    let ancestor: Element | null = element;
    for (let depth = 0; ancestor && depth < 32; depth++) {
      if (ancestor === expected.root) return true;
      const tree = ancestor.getRootNode();
      ancestor = ancestor.parentElement ?? (tree instanceof ShadowRoot ? tree.host : null);
    }
    return false;
  }, { sdk, root: rootHandle, selector: recipe.controlSelector });
  if (!valid) { await sdk.dispose(); return null; }
  return { root, rootHandle, controlHandle, sdk, recipe };
}

/** Exact registered markup plus SDK identity; TrustArc additionally provides
 * the generated dialog/content IDs through its retained SDK object. */
export async function verifyPreferencePortal(page: Page, panel: Locator, proof: NonNullable<Awaited<ReturnType<typeof preparePreferencePortal>>>, panelHandle?: ElementHandle) {
  if (await panel.count() !== 1 || await proof.root.count() !== 1) return false;
  return panel.evaluate((element, expected) => {
    let sdk: unknown = window;
    for (const key of expected.recipe.sdkPath) {
      if (!sdk || !["object", "function"].includes(typeof sdk)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(sdk, key);
      sdk = descriptor && "value" in descriptor ? descriptor.value : null;
    }
    if (sdk !== expected.sdk || !expected.root.isConnected || !expected.control.isConnected ||
        !element.isConnected || element.ownerDocument !== document || expected.panel && element !== expected.panel ||
        document.querySelector(expected.recipe.rootSelector) !== expected.root || !element.matches(expected.recipe.panelSelector)) return false;
    let ancestor: Element | null = expected.control;
    for (let depth = 0; ancestor && ancestor !== expected.root && depth < 32; depth++) {
      const tree = ancestor.getRootNode(); ancestor = ancestor.parentElement ?? (tree instanceof ShadowRoot ? tree.host : null);
    }
    if (ancestor !== expected.root || !expected.control.matches(expected.recipe.controlSelector)) return false;
    if (!["dialog", "alertdialog"].includes(element.getAttribute("role") ?? "") || !element.getAttribute("aria-label")?.trim()) return false;
    if (expected.recipe.kind === "trustarc_portal") {
      const dialogId = Object.getOwnPropertyDescriptor(sdk, "popdiv3");
      const contentId = Object.getOwnPropertyDescriptor(sdk, "popframe");
      if (!dialogId || !("value" in dialogId) || !contentId || !("value" in contentId) || typeof dialogId.value !== "string" || typeof contentId.value !== "string") return false;
      if (element.id !== dialogId.value || !/^pop-div3\d{1,32}$/.test(dialogId.value) || !/^pop-frame\d{1,32}$/.test(contentId.value)) return false;
      const content = element.querySelectorAll('div[name="trustarc_cm"].trustarc_newcm_container.truste_popframe');
      if (content.length !== 1 || content[0]!.id !== contentId.value) return false;
    } else if (element.parentElement?.id !== "iubenda-iframe" || document.querySelectorAll("#iubenda-iframe").length !== 1) return false;
    return true;
  }, { sdk: proof.sdk, root: proof.rootHandle, control: proof.controlHandle, recipe: proof.recipe, panel: panelHandle });
}
