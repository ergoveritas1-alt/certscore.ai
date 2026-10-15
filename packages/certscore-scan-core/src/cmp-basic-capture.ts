import { cmpInventoryScopeSelector, readCmpScopeInventory } from "./cmp-scope-inventory.js";
import { cmpBasicEvidenceSchema, type CmpBasicEvidence } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { Page } from "playwright";
import { readBorlabsPreferenceInventory, readPreferenceControls, classifyControls } from "./cmp-preferences-observer.js";
import { readOneTrustPreferenceInventory } from "./onetrust-preference-inventory.js";
import { readCookieYesPreferenceInventory } from "./cookieyes-preference-inventory.js";
import { readPrivacyLinkAccess, privacyPolicyLinkCandidates } from "./privacy-link-access.js";

/** Opportunistic read in the existing consent-proof visit. No action, wait,
 * navigation, retry or late join. The caller retains only a settled, loader-bound
 * result before the existing lane deadline. Partial lists never prove absence. */
export async function captureCmpBasicEvidence(input: {
  page: Page; scanId: string; targetUrl: string; scanStartedAtMs: number;
  readBinding: () => { url: string; token?: string };
  isCurrent: () => boolean;
  onOutcome?: (reason: string) => void;
}): Promise<CmpBasicEvidence | undefined> {
  const { page } = input;
  const before = input.readBinding();
  if (!before.token) { input.onOutcome?.("document_binding_missing"); return undefined; }
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  const definitions = KNOWN_CMP_REGISTRY.filter(d => d.domSelectors?.length || d.preferenceScopeSelector);
  const scopes = definitions.map(cmpInventoryScopeSelector);
  const scopeInventory = await readCmpScopeInventory(page, definitions);
  const indices = scopeInventory.indices;
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  if (indices.length !== 1) { input.onOutcome?.(indices.length ? "ambiguous_registry_scopes" : "registered_scope_unavailable"); return undefined; }
  const index = indices[0]!, definition = definitions[index]!;
  if (definition.initialOptionalOffCloseObservation && await page.locator(scopes[index]!).count() !== 1) {
    input.onOutcome?.("ambiguous_passive_container"); return undefined;
  }
  const inventory = definition.preferenceInspection?.kind === "borlabs_v3" ? await readBorlabsPreferenceInventory(page)
    : definition.canonicalName === "OneTrust" ? await readOneTrustPreferenceInventory(page)
    : definition.preferenceInventory === "cookieyes_loaded_configuration.v1" ? await readCookieYesPreferenceInventory(page) : undefined;
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  const rawControls = await readPreferenceControls(page.locator(scopes[index]!), definition.preferenceCategoryInventory, definition.initialOptionalOffCloseObservation?.inputSelector);
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  // The visible CMP surface takes priority over potentially thousands of
  // unrelated page links. Classify bounded names first; hit-test only privacy links rather than every
  // link on a prolific page. Recheck the exact identity before reading geometry.
  const privacyScope = page.locator(scopes[index]!).locator("a[href]");
  const links = await privacyScope.evaluateAll(nodes => nodes.slice(0, 300).map((node, index) => ({
    index, url: (node as HTMLAnchorElement).href,
    label: (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().slice(0, 160),
  })));
  const candidates = privacyPolicyLinkCandidates(links);
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  const privacyLinks = (await privacyScope.evaluateAll(readPrivacyLinkAccess, {candidates}))
    .map(({url,hitTargetBeforeAction,access})=>({url,hitTargetBeforeAction,access}));
  const after = input.readBinding();
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  if (before.url !== after.url || before.token !== after.token) { input.onOutcome?.("document_changed"); return undefined; }
  input.onOutcome?.("captured");
  return cmpBasicEvidenceSchema.parse({
    contractVersion: "certscore.cmp-basic-evidence.v1", sourceLane: "consent_proof", scanId: input.scanId,
    targetUrl: input.targetUrl, documentUrl: before.url, documentToken: before.token,
    capturedAtMs: Date.now() - input.scanStartedAtMs, provider: definition.canonicalName,
    configuredConsentCookies: scopeInventory.configuredConsentCookies,
    controls: classifyControls(rawControls.controls, inventory), privacyLinks,
    declarations: inventory?.declarations ?? [], serviceNames: (inventory?.services ?? []).filter(Boolean),
    serviceDisclosures: inventory && "serviceDisclosures" in inventory ? inventory.serviceDisclosures : undefined,
    limitations: ["passive_first_layer_only", "declaration_inventory_not_complete", ...(definition.preferenceInventory ? [definition.preferenceInventory, "loaded_configuration_not_visibility_proof"] : []), ...(rawControls.overflow ? ["control_inventory_overflow"] : []),
      ...(inventory && "truncated" in inventory && inventory.truncated ? ["cmp_inventory_bounded"] : [])],
  });
}
