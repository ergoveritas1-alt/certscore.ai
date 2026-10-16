import { cmpInventoryScopeSelector, readCmpScopeInventory } from "./cmp-scope-inventory.js";
import { cmpBasicEvidenceSchema, projectLoadedCmpInventory, projectSdkCmpServices, type CmpBasicEvidence } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { Page } from "playwright";
import { readBorlabsPreferenceInventory, readPreferenceControls, classifyControls } from "./cmp-preferences-observer.js";
import { readOneTrustPreferenceInventory } from "./onetrust-preference-inventory.js";
import { readCookieYesPreferenceInventory } from "./cookieyes-preference-inventory.js";
import { readPrivacyLinkAccess, privacyPolicyLinkCandidates } from "./privacy-link-access.js";
import { readPassiveCookiebotLoadedInventory } from "./cookiebot-loaded-inventory.js";
import { readPassiveConsentmanagerLoadedInventory } from "./consentmanager-loaded-inventory.js";
import { readPassiveDidomiServiceInventory } from "./didomi-service-inventory.js";

/** Opportunistic read in the existing consent-proof visit. No action, wait,
 * navigation, retry or late join. The caller retains only a settled, loader-bound
 * result before the existing lane deadline. Partial lists never prove absence. */
export async function captureCmpBasicEvidence(input: {
  page: Page; scanId: string; targetUrl: string; scanStartedAtMs: number;
  readBinding: () => { url: string; token?: string };
  isCurrent: () => boolean;
  onOutcome?: (reason: string) => void;
  onCheckpoint?: (packet:CmpBasicEvidence)=>void;
  deferPublicPrivacyLinks?: boolean;
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
  if(inventory && "configurationVersion" in inventory) packet.limitations.push(inventory.configurationVersion,"loaded_configuration_not_visibility_proof");
  packet.controls=classifyControls(rawControls.controls,inventory);
  if(inventory) packet.captureProgress!.declarationsAtMs=Date.now()-input.scanStartedAtMs;
  if(inventory && "truncated" in inventory && inventory.truncated) packet.limitations.push("cmp_inventory_bounded");
  if(definition.preferenceInventory) packet.limitations.push(definition.preferenceInventory,"loaded_configuration_not_visibility_proof");
  if (definition.passiveServiceInventory && input.isCurrent()) {
    const services = await readPassiveDidomiServiceInventory(page, definition, before.token);
    if (services) {
      packet.contractVersion = "certscore.cmp-basic-evidence.v4";
      packet.sdkServiceInventory = services;
      packet.serviceNames = projectSdkCmpServices(services);
      packet.captureProgress!.declarationsAtMs = Date.now() - input.scanStartedAtMs;
      packet.limitations.push("loaded_configuration_not_visibility_proof", "service_inventory_not_complete");
      if (services.truncated) packet.limitations.push("cmp_inventory_bounded");
    }
  }
  if (definition.passiveLoadedInventory && input.isCurrent()) {
    const loaded=definition.passiveLoadedInventory.version==="consentmanager_passive_loaded_inventory.v1"
      ? await readPassiveConsentmanagerLoadedInventory(page,definition) : await readPassiveCookiebotLoadedInventory(page,definition);
    if (loaded) {
      packet.contractVersion=loaded.version==="consentmanager_loaded_declarations.v1" ? "certscore.cmp-basic-evidence.v3" : "certscore.cmp-basic-evidence.v2";
      packet.loadedInventory=loaded;
      packet.loadedInventoryBinding={...definition.passiveLoadedInventory,documentToken:before.token};
      packet.declarations=projectLoadedCmpInventory(loaded).declarations;
      packet.inventoryManifest=loaded.inventoryManifest;
      packet.captureProgress!.declarationsAtMs=Date.now()-input.scanStartedAtMs;
      packet.limitations.push("loaded_declarations_not_visibility_proof");
      if (loaded.truncated) packet.limitations.push("cmp_inventory_bounded");
      if (loaded.unresolvedRecords) packet.limitations.push("loaded_inventory_records_unresolved");
    }
  }
  if(!checkpoint() || !input.isCurrent()) {input.onOutcome?.("capture_slice_exhausted");return retained;}
  if (input.deferPublicPrivacyLinks && definition.passivePrivacyLinkInspection==="same_origin_after_visual.v1") return retained;
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

export function usesDeferredPassivePrivacyLinks(provider:string){
  return KNOWN_CMP_REGISTRY.some(d=>d.canonicalName===provider && d.passivePrivacyLinkInspection==="same_origin_after_visual.v1");
}

/** Called after consent visual work, using only the unused passive-read budget.
 * A single restored document scroll can verify a public link without opening it. */
export async function finishPassiveCmpPrivacyLinks(input: {
  page:Page; packet:CmpBasicEvidence; scanStartedAtMs:number;
  readBinding:()=>{url:string;token?:string}; isCurrent:()=>boolean;
}):Promise<CmpBasicEvidence|undefined> {
  const {packet,page}=input;
  const bound=()=>{const current=input.readBinding();return input.isCurrent() && current.url===packet.targetUrl && current.token===packet.documentToken;};
  if (!bound()) return undefined;
  const scope=page.locator('a[href]');
  const links=await scope.evaluateAll(nodes=>nodes.slice(0,300).map((node,index)=>({index,url:(node as HTMLAnchorElement).href,
    label:(node.getAttribute('aria-label')??node.textContent??'').trim().slice(0,160)})));
  if(!bound())return undefined;
  const origin=new URL(packet.targetUrl).origin;
  const candidates=privacyPolicyLinkCandidates(links.filter(link=>{try{return new URL(link.url).origin===origin;}catch{return false;}}));
  const privacyLinks=(await scope.evaluateAll(readPrivacyLinkAccess,{candidates,allowOneDocumentScroll:true}))
    .map(({url,hitTargetBeforeAction,access})=>({url,hitTargetBeforeAction,access}));
  if(!bound())return undefined;
  const capturedAtMs=Date.now()-input.scanStartedAtMs;
  return cmpBasicEvidenceSchema.parse({...packet,privacyLinks,capturedAtMs,
    privacyLinkInspection:{version:'passive_public_privacy_links.v1',scope:'same_origin_page',documentToken:packet.documentToken},
    captureProgress:{...packet.captureProgress,version:'cmp_capture_checkpoints.v1',documentToken:packet.documentToken,privacyLinksAtMs:capturedAtMs}});
}
