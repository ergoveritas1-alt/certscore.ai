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
  onCheckpoint?: (packet:CmpBasicEvidence)=>void;
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
  const packet:CmpBasicEvidence={contractVersion:"certscore.cmp-basic-evidence.v1",sourceLane:"consent_proof",scanId:input.scanId,
    targetUrl:input.targetUrl,documentUrl:before.url,documentToken:before.token,capturedAtMs:Date.now()-input.scanStartedAtMs,
    provider:definition.canonicalName,configuredConsentCookies:scopeInventory.configuredConsentCookies,
    controls:[],privacyLinks:[],declarations:[],serviceNames:[],
    captureProgress:{version:"cmp_capture_checkpoints.v1",documentToken:before.token},
    limitations:["passive_first_layer_only","declaration_inventory_not_complete"]};
  let retained:CmpBasicEvidence|undefined;
  const checkpoint=()=>{
    const after=input.readBinding();
    if(!input.isCurrent() || before.url!==input.targetUrl || before.url!==after.url || before.token!==after.token) return false;
    packet.capturedAtMs=Date.now()-input.scanStartedAtMs;
    retained=cmpBasicEvidenceSchema.parse(structuredClone(packet));
    input.onCheckpoint?.(retained);return true;
  };
  // Protect the minimal visible-control packet before descriptions or links.
  const rawControls=await readPreferenceControls(page.locator(scopes[index]!),definition.preferenceCategoryInventory,definition.initialOptionalOffCloseObservation?.inputSelector);
  packet.controls=classifyControls(rawControls.controls);
  packet.captureProgress!.controlsAtMs=Date.now()-input.scanStartedAtMs;
  if(rawControls.overflow) packet.limitations.push("control_inventory_overflow");
  if(!checkpoint() || !input.isCurrent()) {input.onOutcome?.("capture_slice_exhausted");return retained;}
  const inventory=definition.preferenceInspection?.kind==="borlabs_v3" ? await readBorlabsPreferenceInventory(page)
    : definition.canonicalName==="OneTrust" ? await readOneTrustPreferenceInventory(page)
    : definition.preferenceInventory==="cookieyes_loaded_configuration.v1" ? await readCookieYesPreferenceInventory(page) : undefined;
  packet.declarations=inventory?.declarations??[];packet.serviceNames=inventory?.services.filter(Boolean)??[];
  packet.serviceDisclosures=inventory && "serviceDisclosures" in inventory ? inventory.serviceDisclosures : undefined;
  packet.inventoryManifest=inventory && "inventoryManifest" in inventory ? inventory.inventoryManifest : undefined;
  packet.controls=classifyControls(rawControls.controls,inventory);
  if(inventory) packet.captureProgress!.declarationsAtMs=Date.now()-input.scanStartedAtMs;
  if(inventory && "truncated" in inventory && inventory.truncated) packet.limitations.push("cmp_inventory_bounded");
  if(definition.preferenceInventory) packet.limitations.push(definition.preferenceInventory,"loaded_configuration_not_visibility_proof");
  if(!checkpoint() || !input.isCurrent()) {input.onOutcome?.("capture_slice_exhausted");return retained;}
  const privacyScope=page.locator(scopes[index]!).locator("a[href]");
  const links=await privacyScope.evaluateAll(nodes=>nodes.slice(0,300).map((node,index)=>({index,url:(node as HTMLAnchorElement).href,
    label:(node.getAttribute("aria-label")??node.textContent??"").trim().slice(0,160)})));
  if(!input.isCurrent()) {input.onOutcome?.("capture_slice_exhausted");return retained;}
  packet.privacyLinks=(await privacyScope.evaluateAll(readPrivacyLinkAccess,{candidates:privacyPolicyLinkCandidates(links)}))
    .map(({url,hitTargetBeforeAction,access})=>({url,hitTargetBeforeAction,access}));
  packet.captureProgress!.privacyLinksAtMs=Date.now()-input.scanStartedAtMs;
  if(!checkpoint() || !input.isCurrent()) {input.onOutcome?.("capture_slice_exhausted");return retained;}
  input.onOutcome?.("captured");return retained;
}
