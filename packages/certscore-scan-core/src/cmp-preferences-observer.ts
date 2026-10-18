import {observedLinkedPreferenceTarget,readLinkedPrivacyChoices} from "./linked-preference-read.js";
import {inspectPreferenceAccessibility} from "./cmp-preference-accessibility.js";
import { bindPostRefusalBrowserResolvedExactTarget, RESOLVED_SCAN_TARGET_AUTHORIZATION_ID } from "./post-refusal-target-authorization.js";
import { readPreferenceControlsInDocument } from "./cmp-preference-control-read.js";
import { readVisibleCmpInventory } from "./cmp-visible-inventory.js";
import { projectVisibleCmpInventory } from "@certscore/contracts";
import { preparePreferencePortal, verifyPreferencePortal, waitForPreferencePortalContent } from "./cmp-preference-portal.js";
import { classifyConsentGeometryAccess } from "./consent-geometry-access.js";
import { waitForConsentDocumentReady } from "./consent-document-readiness.js";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { describeCaptureFailure, cmpPreferenceBudgetMs, CMP_PREFERENCE_POLICY_VERSION, classifyConsentControlLabel, classifyConsentPreferenceControl, cmpPreferenceDispatchSchema, cmpPreferencesEvidenceSchema, type CmpPreferenceDispatch, type CmpPreferencesEvidence } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY, type KnownCmpDefinition } from "@website-signal-risk-scanner/shared";
import { chromiumContextOptions, chromiumLaunchOptions, chromiumHttpUserAgent } from "./playwright-runtime.js";
import { installPublicNetworkGuardRoute, assertPublicNetworkUrl, publicNetworkGuardEnabled } from "./public-network-guard.js";
import { installWebBotAuthRoute, buildWebBotAuthBrowserHeaders } from "./web-bot-auth-routing.js";
import { dispatchLocatorClickWithVerifiedGeometry } from "./cmp-control-actionability.js";
import { installBorlabsDeferredDialogReveal, revealBorlabsDeferredDialog } from "./borlabs-passive-dialog-reveal.js";
import { readOneTrustPreferenceInventory } from "./onetrust-preference-inventory.js";
import { readCookieYesPreferenceInventory } from "./cookieyes-preference-inventory.js";
import { cmpInventoryScopeSelector, readCmpScopeInventory } from "./cmp-scope-inventory.js";
import { verifyDeferredPreferencePanel } from "./cmp-preference-panel-binding.js";
import { EVIDENCE_WORK_POLICY, optionalEvidenceAllowance } from "./evidence-work-budget.js";
import { readPrivacyLinkAccess, privacyPolicyLinkCandidates } from "./privacy-link-access.js";
import { readCmpOptionsInventory } from "./cmp-options-inventory.js";
import { readCookiebotLoadedInventory } from "./cookiebot-loaded-inventory.js";
import { projectLoadedCmpInventory } from "@certscore/contracts";

/** One isolated inspection: either a verified same-origin linked preferences
 * visit or a single registered Options action. No preference changes, save,
 * second action, page retry, model call, or interaction in another lane. */
export async function runCmpPreferencesObserver(input: {
  config: CmpPreferenceDispatch; parentDispatchSha256: string; signal?: AbortSignal;
  browser?: Browser; deadlineAtMs?: number;
}): Promise<CmpPreferencesEvidence> {
  const config = cmpPreferenceDispatchSchema.parse(input.config);
  const started = Date.now();
  const budgetMs = cmpPreferenceBudgetMs(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE === undefined
    ? (process.env.AWS_LAMBDA_FUNCTION_NAME ? NaN : 3008) : Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE), config.computeBudgetPolicy);
  const boundedCoverage = config.computeBudgetPolicy === "coverage_25_gb_seconds.v1";
  const captureBudgetMs = Math.max(1, Math.min(budgetMs - (boundedCoverage ? 500 : 0),
    (input.deadlineAtMs ?? Infinity) - started - 250));
  const deadline = started + captureBudgetMs;
  const packet: CmpPreferencesEvidence = {
    contractVersion: "certscore.cmp-preferences-evidence.v1", policyVersion: CMP_PREFERENCE_POLICY_VERSION,
    scanId: config.scanId, parentDispatchSha256: input.parentDispatchSha256, targetUrl: config.exactTargetUrl,
    finalUrl: null, documentToken: null, startedAt: new Date(started).toISOString(), completedAt: new Date(started).toISOString(),
    status: "limited", support: { state: "unknown", provider: null, recipeVersion: null, reason: "inspection_incomplete" },
    action: { count: 0, intent: "options", label: null, opened: false }, controls: [], controlInventoryComplete: false,
    privacyLinks: [], declarations: [], declarationInventoryComplete: false, limitations: [],
    inspectionDiagnostic: { revision: "cmp_preferences.v17", budgetMs, basicCaptureReserveMs: Math.min(EVIDENCE_WORK_POLICY.preferences.basicCaptureReserveMs, Math.floor(budgetMs / 3)), phase: "browser_start" },
  };
  let browser = input.browser;
  let context: BrowserContext | undefined;
  let captureLoadedConfiguration:(()=>Promise<void>)|undefined;
  let expired = false;
  const cancel = (timedOut: boolean) => { expired = timedOut; void context?.close().catch(() => undefined); if (!input.browser) void browser?.close().catch(() => undefined); };
  const timer = setTimeout(() => cancel(true), captureBudgetMs);
  const abort = () => cancel(false);
  input.signal?.addEventListener("abort", abort, { once: true });
  const remaining = () => {
    if (input.signal?.aborted) throw new Error("preference_inspection_cancelled");
    if (expired || Date.now() >= deadline || (input.deadlineAtMs !== undefined && Date.now() + 250 >= input.deadlineAtMs)) throw new Error("preference_budget_exhausted");
    return Math.max(1, deadline - Date.now());
  };
  try {
    remaining();
    browser ??= await chromium.launch({ ...chromiumLaunchOptions({ headless: true }), timeout: remaining() });
    remaining();
    context = await browser.newContext(chromiumContextOptions());
    await installWebBotAuthRoute(context);
    await installPublicNetworkGuardRoute(context);
    const page = await context.newPage();
    // Every locator uses the same absolute inspection deadline. A blanket
    // 300 ms operation timeout abandoned verified controls on busy pages long
    // before that deadline. Explicit click/readiness caps below stay unchanged;
    // the deadline timer closes this context even if a browser command stalls.
    page.setDefaultTimeout(remaining());
    await installBorlabsDeferredDialogReveal(page, config.exactTargetUrl);
    // Passive navigation may resolve redirects under the public-network guard.
    // No Options action is authorized until the final document is bound below.
    let exactDocumentUrl: string | null = null;
    let navigationCount = 0;
    let allowedLinkedDocumentUrl:string|null=null;
    let readOnlyLinkedDocument=false;
    page.on("request", request => { if(request.isNavigationRequest() && request.frame()===page.mainFrame()) navigationCount++; });
    await context.route("**/*", async route => {
      const request = route.request();
      if(readOnlyLinkedDocument && ["image","media"].includes(request.resourceType())) {await route.abort();return;}
      if(allowedLinkedDocumentUrl && request.isNavigationRequest() && request.frame()===page.mainFrame() && request.url()===allowedLinkedDocumentUrl) {
        // Playwright routes do not re-run for redirects. Fetch this one observed
        // destination without following a redirect, then retain its real URL.
        try {
          if(publicNetworkGuardEnabled())await assertPublicNetworkUrl(request.url(),{signal:input.signal});
          const userAgent=chromiumHttpUserAgent();
          const response=await route.fetch({maxRedirects:0,timeout:Math.max(1,Math.min(3500,remaining()-500)),headers:{...request.headers(),
            ...(userAgent?{"user-agent":userAgent}:{}),...(buildWebBotAuthBrowserHeaders(request.url())?.headers??{})}});
          if(response.status()>=300&&response.status()<400)await route.abort();
          else await route.fulfill({response});
        }catch{await route.abort().catch(()=>undefined);}
        return;
      }
      if (request.isNavigationRequest() && request.frame() === page.mainFrame() &&
          (exactDocumentUrl ? request.url() !== exactDocumentUrl && request.url() !== allowedLinkedDocumentUrl : navigationCount > 9 || request.url() !== config.exactTargetUrl && !request.url().startsWith("https://"))) await route.abort();
      else await route.fallback();
    });
    packet.inspectionDiagnostic!.phase = "navigation";
    const navigation = await page.goto(config.exactTargetUrl, { waitUntil: "commit", timeout: remaining() });
    const httpStatus = navigation?.status();
    if (httpStatus) packet.inspectionDiagnostic!.navigationHttpStatus = httpStatus;
    // Classify the main navigation response before reading mutable document
    // state. An error-page challenge can replace its URL during commit; that
    // must not hide its HTTP failure or retain transient challenge tokens.
    // No document/control evidence is accepted on this terminal path.
    const access = classifyConsentGeometryAccess({ httpStatus });
    if (access.status !== "loaded" && access.status !== "unknown") {
      packet.support.reason = "preference_page_access_limited";
      packet.limitations.push("preference_page_access_limited", ...access.reasonCodes);
      return finish();
    }
    exactDocumentUrl=config.exactTargetUrl;
    if(page.url()!==config.exactTargetUrl) {
      const resolved = await bindPostRefusalBrowserResolvedExactTarget({requestedUrl:config.exactTargetUrl, finalUrl:page.url(), redirectCount:Math.max(0,navigationCount-1), durationMs:Date.now()-started},
        {authorizationId:RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,kind:"scan_target_resolution",requestedUrl:config.exactTargetUrl,scanId:config.scanId,maxRedirects:8,resolutionTimeoutMs:captureBudgetMs},config.scanId);
      if(resolved.status!=="resolved") throw new Error("preference_redirect_unverified");
      exactDocumentUrl=resolved.targetUrl;
    }
    const session = await context.newCDPSession(page);
    // Subscribe before the initial read; subsequent binding checks use the
    // loader stream rather than serial browser round trips on a busy renderer.
    let currentLoader: string | null = null;
    session.on("Page.frameNavigated", ({frame})=>{if(!frame.parentId)currentLoader=frame.loaderId;});
    await session.send("Page.enable");
    const initialFrame = (await session.send("Page.getFrameTree")).frameTree.frame;
    packet.finalUrl = page.url();
    packet.documentToken = initialFrame.loaderId;
    currentLoader = initialFrame.loaderId;
    if(exactDocumentUrl!==config.exactTargetUrl) packet.navigationBinding={policyVersion:"passive_redirect_exact_document.v1",requestedUrl:config.exactTargetUrl,finalUrl:exactDocumentUrl,documentToken:packet.documentToken!,redirectCount:Math.max(0,navigationCount-1)};
    const binding = async () => {
      remaining();
      if (page.url() !== exactDocumentUrl || currentLoader !== packet.documentToken) throw new Error("preference_document_changed");
    };
    // Loader changes invalidate every checkpoint, including changes during a
    // timed-out click. A closed context alone does not invalidate earlier proof.
    session.on("Page.frameNavigated", ({ frame }) => {
      if (!frame.parentId && frame.loaderId !== packet.documentToken) {
        packet.checkpoints = undefined; packet.configuredConsentCookies = undefined; packet.controls = []; packet.privacyLinks = [];
        packet.declarations = []; packet.visibleInventory = undefined; packet.loadedInventory = undefined; packet.inventoryManifest=undefined; packet.captureProgress=undefined; packet.serviceNames = undefined; packet.serviceDisclosures = undefined; packet.declarationCoverage = undefined; packet.declarationInventoryComplete = false;
        packet.controlInventoryComplete = false; packet.action.opened = false; packet.accessibilityAudit=undefined;
        packet.navigationBinding = undefined; packet.linkedPreferenceNavigation=undefined; packet.documentToken = null; packet.limitations.push("preference_document_changed");
      }
    });
    await binding();
    packet.captureProgress={version:"cmp_capture_checkpoints.v1",documentToken:packet.documentToken!};
    packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: packet.documentToken!, privacyLinks: false, declarations: false, controls: false, controlsSurface: "first_layer" };
    const capturePrivacyLinks=async(early=false)=>{
      if(early && packet.checkpoints?.privacyLinks)return;
    const privacyScope = page.locator("a[href]");
    const links = await privacyScope.evaluateAll(nodes => nodes.slice(0, 300).map((node, index) => ({
      index, url: (node as HTMLAnchorElement).href,
      label: (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().slice(0, 160),
    })));
    const privacyCandidates = privacyPolicyLinkCandidates(links);
    if(early && privacyCandidates.length===0)return;
    // Spend the existing hit-test allowance on privacy surfaces, not unrelated
    // navigation links. The browser callback rechecks each exact link identity.
    packet.privacyLinks = (await privacyScope.evaluateAll(readPrivacyLinkAccess, { candidates: privacyCandidates, allowOneDocumentScroll: !early }))
      .map(({url, hitTargetBeforeAction, access}) => ({url, hitTargetBeforeAction, access}));
    await binding();
    packet.checkpoints!.privacyLinks = true;
    packet.captureProgress!.privacyLinksAtMs=Date.now()-started;
    };
    const captureLinkedPreferences=async()=>{
      if(remaining()<2000)return false;
      const target=await observedLinkedPreferenceTarget(page);
      await binding();
      if(!target)return false;
      const sourceUrl=page.url(),sourceDocumentToken=packet.documentToken!;
      const parentNavigation=packet.navigationBinding;
      allowedLinkedDocumentUrl=target.url;readOnlyLinkedDocument=true;
      packet.inspectionDiagnostic!.linkedPageStage="navigation";
      packet.inspectionDiagnostic!.phase="navigation";
      const response=await page.goto(target.url,{waitUntil:"commit",timeout:Math.max(1,Math.min(3500,remaining()-500))});
      if(response)packet.inspectionDiagnostic!.navigationHttpStatus=response.status();
      if(response && [401,403,429].includes(response.status())) {
        packet.finalUrl=page.url();packet.documentToken=null;packet.checkpoints=undefined;packet.captureProgress=undefined;
        packet.support={state:"unknown",provider:null,recipeVersion:null,reason:"preference_page_access_limited"};
        packet.limitations.push("preference_page_access_limited");
        return true;
      }
      if(!response?.ok()||page.url()!==target.url)throw new Error("linked_preference_navigation_failed");
      exactDocumentUrl=target.url;allowedLinkedDocumentUrl=null;
      const frame=(await session.send("Page.getFrameTree")).frameTree.frame;
      packet.finalUrl=page.url();packet.documentToken=frame.loaderId;currentLoader=frame.loaderId;
      packet.navigationBinding=parentNavigation;
      packet.linkedPreferenceNavigation={policyVersion:"read_only_linked_preferences.v1",sourceUrl,sourceDocumentToken,
        label:target.label,destinationUrl:target.url,documentToken:frame.loaderId};
      packet.captureProgress={version:"cmp_capture_checkpoints.v1",documentToken:frame.loaderId};
      packet.checkpoints={version:"cmp_partial_capture.v1",documentToken:frame.loaderId,privacyLinks:false,declarations:false,controls:false,controlsSurface:"preferences"};
      packet.limitations=[];
      packet.inspectionDiagnostic!.phase="preference_inventory";
      packet.inspectionDiagnostic!.linkedPageStage="readiness";
      await waitForConsentDocumentReady(page,Math.min(deadline-500,Date.now()+1000),input.signal);
      packet.inspectionDiagnostic!.linkedPageStage="controls";
      let read=await readLinkedPrivacyChoices(page);
      while((!read.controls.length||read.controls.every(control=>!control.enabled))&&!read.overflow&&remaining()>650){
        await page.waitForTimeout(100);
        read=await readLinkedPrivacyChoices(page);
      }
      await binding();
      if(read.overflow)packet.limitations.push("control_inventory_overflow");
      packet.controls=read.controls;packet.controlInventoryComplete=false;
      if(read.controls.length){packet.checkpoints.controls=true;packet.captureProgress.controlsAtMs=Date.now()-started;}
      packet.support={state:"partial",provider:null,recipeVersion:CMP_PREFERENCE_POLICY_VERSION,reason:read.controls.length?"read_only_linked_privacy_preferences":"linked_privacy_controls_not_retained"};
      if(remaining()>300)await capturePrivacyLinks();
      await binding();
      if(read.controls.length&&read.controls.every(control=>!control.enabled))packet.limitations.push("linked_privacy_controls_inactive_at_capture");
      packet.status=read.controls.some(control=>control.enabled)&&!read.overflow?"completed":"limited";
      packet.inspectionDiagnostic!.linkedPageStage="completed";
      return true;
    };
    // An explicit, verified same-origin settings route is a complete read-only
    // inspection destination. Do not spend its navigation budget first scanning
    // every CMP implementation on a busy homepage.
    if(await captureLinkedPreferences())return finish();
    await capturePrivacyLinks(true);
    // Readiness, navigation, inventory and opening share one wall-clock budget.
    // Waiting for the first visible vendor surface avoids racing delayed CMP init.
    const definitions = KNOWN_CMP_REGISTRY.filter(definition => definition.domSelectors?.length || definition.preferenceScopeSelector);
    packet.inspectionDiagnostic!.phase = "cmp_readiness";
    // A rendered CMP may be ready while unrelated page scripts still delay
    // DOMContentLoaded. Race positive registered control visibility against
    // document readiness within the same deadline; neither authorizes a click.
    const readinessDeadline = deadline - packet.inspectionDiagnostic!.basicCaptureReserveMs!;
    const readySelectors = definitions.flatMap(definition => definition.preferenceInspection
      ? [`${definition.preferenceInspection.entranceSelector} ${definition.preferenceInspection.controlSelector}`]
      : [...(definition.preferenceScopeSelector ? [definition.preferenceScopeSelector] : definition.domSelectors!).flatMap(selector => [`:is(${selector}):is(button, [role="button"], input[type="button"])`, `:is(${selector}) :is(button, [role="button"], input[type="button"])`]),
          ...(definition.preferenceDialogBinding ? [definition.preferenceDialogBinding.controlSelector] : [])]);
    // Playwright's CSS locator traverses open shadow roots (Borlabs v3).
    const readyControl = page.locator(readySelectors.map(selector => `:is(${selector}):visible`).join(",")).first();
    const initialReadinessDeadline = Math.min(readinessDeadline, started + Math.floor(captureBudgetMs / 3));
    let cmpReady = await Promise.race([
      waitForConsentDocumentReady(page, initialReadinessDeadline, input.signal),
      readyControl.waitFor({ state: "visible", timeout: Math.max(1, initialReadinessDeadline - Date.now()) })
        .then(() => !input.signal?.aborted && Date.now() < readinessDeadline, () => false),
    ]);
    await binding();
    if (!cmpReady) {
      const scopes = await readCmpScopeInventory(page, definitions);
      await binding();
      if (!scopes.overflow && !scopes.runtimeIdentified && scopes.indices.length === 0) {
        if(await captureLinkedPreferences())return finish();
        packet.support.reason = "cmp_not_identified_after_bounded_readiness";
        packet.limitations.push(packet.support.reason);
        await capturePrivacyLinks();
        return finish();
      }
      // A positively identified CMP keeps the rest of its original readiness
      // allowance. Unrelated deferred scripts do not consume basic capture.
      cmpReady = true;
    }
    let revealed = false;
    let unidentifiedScopeChecked = false;
    while (cmpReady && !await readyControl.isVisible()) {
      remaining();
      if (Date.now() >= readinessDeadline) { cmpReady = false; break; }
      // Retain completed basic checkpoints instead of losing the whole optional
      // packet at a fast passive barrier. A known registered scope keeps its
      // full search allowance. An unidentified surface remains unknown, never absent.
      if (!unidentifiedScopeChecked && Date.now() - started >= Math.min(8000, Math.floor(captureBudgetMs / 3))) {
        unidentifiedScopeChecked = true;
        const scopes = await readCmpScopeInventory(page, definitions);
        await binding();
        if (!scopes.overflow && !scopes.runtimeIdentified && scopes.indices.length === 0) {
          if(await captureLinkedPreferences())return finish();
          packet.support.reason = "cmp_not_identified_after_bounded_readiness";
          packet.limitations.push(packet.support.reason);
          await capturePrivacyLinks();
          return finish();
        }
      }
      // Reuse the registered passive one-pixel scroll only when Borlabs' own
      // configuration explicitly defers its dialog until visitor interaction.
      if (!revealed) revealed = await revealBorlabsDeferredDialog(page);
      packet.inspectionDiagnostic!.passiveDialogReveal = revealed;
      try { await readyControl.waitFor({ state: "visible", timeout: Math.max(1, Math.min(250, readinessDeadline - Date.now(), remaining())) }); }
      catch (error) { if (!(error instanceof Error) || error.name !== "TimeoutError") throw error; }
    }
    await binding();
    packet.inspectionDiagnostic!.phase = "control_inventory";
    const matches: Array<{ provider: string; control: Locator; label: string; scope: Locator; recipe?: KnownCmpDefinition["preferenceInspection"]; dialogBinding?: KnownCmpDefinition["preferenceDialogBinding"]; observedOptionsLabel?: boolean; privacyEntrance?: boolean; deferredAriaBinding?: KnownCmpDefinition["preferenceDeferredAriaBinding"]; controlScopeSelector?: string; portalRecipe?: KnownCmpDefinition["preferencePortalBinding"] }> = [];
    const detected = new Set<string>();
    // Resolve all registered vendor scopes in one shadow-piercing locator read.
    // Serial full-document selector round trips used most of the remaining
    // budget on busy pages, before we could retain their already-visible CMP.
    const scopeSelectors = definitions.map(cmpInventoryScopeSelector);
    const scopeInventory = await readCmpScopeInventory(page, definitions);
    packet.inspectionDiagnostic!.passiveDialogReveal = revealed || scopeInventory.revealed;
    packet.inspectionDiagnostic!.identityScopes = { version: "cmp_scope_activity.v1", providers: scopeInventory.scopeStates.map(({index, state}) => ({provider: definitions[index]!.canonicalName, state})) };
    if (scopeInventory.overflow) { packet.limitations.push("control_inventory_overflow"); return finish(); }
    for (const index of scopeInventory.indices) detected.add(definitions[index]!.canonicalName);
    if (detected.size === 1) packet.support = { state: "partial", provider: [...detected][0]!, recipeVersion: CMP_PREFERENCE_POLICY_VERSION, reason: "inspection_incomplete" };
    await binding();
    packet.configuredConsentCookies = scopeInventory.configuredConsentCookies;
    if (detected.size > 1) {
      packet.support = { state: "partial", provider: null, recipeVersion: CMP_PREFERENCE_POLICY_VERSION, reason: "cmp_identity_ambiguous" };
      packet.limitations.push("cmp_identity_ambiguous");
      return finish();
    }
    // Capture visible controls first. Optional loaded configuration follows a
    // bound live panel, or uses remaining allowance when opening is unavailable.
    // Ambiguous vendor identity never authorizes an API read or a click.
    const detectedIndex = detected.size === 1 ? scopeInventory.indices.find(index => definitions[index]?.canonicalName === [...detected][0]) : undefined;
    let initialControls:Awaited<ReturnType<typeof readPreferenceControls>>|undefined;
    // Basic visible choices are valuable even when no unique Options control
    // exists. Preserve their own checkpoint before optional deeper inspection.
    if (detectedIndex !== undefined && definitions[detectedIndex]!.initialOptionalOffCloseObservation &&
        await page.locator(scopeSelectors[detectedIndex]!).count() !== 1) {
      packet.support.reason = "cmp_identity_ambiguous";
      packet.limitations.push("cmp_identity_ambiguous");
      return finish();
    }
    if (detectedIndex !== undefined && remaining() > 250) {
      const initial = await readPreferenceControls(page.locator(scopeSelectors[detectedIndex]!), definitions[detectedIndex]!.preferenceCategoryInventory, definitions[detectedIndex]!.initialOptionalOffCloseObservation?.inputSelector);
      await binding();
      initialControls=initial;
      packet.controls = classifyControls(initial.controls);
      packet.checkpoints!.controls = packet.controls.length>0;
      if(packet.checkpoints!.controls) packet.captureProgress!.controlsAtMs=Date.now()-started;
      if (initial.overflow) packet.limitations.push("control_inventory_overflow");
    }
    let oneTrust:Awaited<ReturnType<typeof readOneTrustPreferenceInventory>>|undefined;
    let configurationCaptured=false;
    captureLoadedConfiguration=async()=>{
      if(configurationCaptured||remaining()<=250)return;
      configurationCaptured=true;
      oneTrust = detected.size === 1 && detected.has("OneTrust") && remaining() > 250
      ? await readOneTrustPreferenceInventory(page) : undefined;
    if (detected.size === 1 && detected.has("OneTrust")) packet.inspectionDiagnostic!.configuration = {
      version: "onetrust_loaded_configuration.v4", status: oneTrust ? "available" : "unavailable",
      ...(oneTrust ? { groupCount: oneTrust.groupCount, retainedCookieCount: oneTrust.declarations.length, truncated: oneTrust.truncated } : {}),
    };
    if (oneTrust) {
      await binding();
      packet.declarations = oneTrust.declarations;
      packet.inventoryManifest=oneTrust.inventoryManifest;
      packet.serviceNames = oneTrust.services;
      packet.serviceDisclosures = oneTrust.serviceDisclosures;
      packet.declarationCoverage = oneTrust.coverage;
      packet.declarationInventoryComplete = false;
      packet.checkpoints!.declarations = true;
    packet.captureProgress!.declarationsAtMs=Date.now()-started;
      if (oneTrust.truncated) packet.limitations.push("cmp_inventory_bounded");
    }
    if (detectedIndex !== undefined && definitions[detectedIndex]?.preferenceInventory === "cookieyes_loaded_configuration.v1" && remaining() > 250) {
      const loaded = await readCookieYesPreferenceInventory(page);
      await binding();
      packet.inspectionDiagnostic!.configuration = { version: "cookieyes_loaded_configuration.v1", status: loaded ? "available" : "unavailable",
        ...(loaded ? { groupCount: loaded.groupCount, retainedCookieCount: loaded.declarations.length, truncated: loaded.truncated } : {}) };
      if (loaded) {
        packet.declarations = loaded.declarations;
        packet.inventoryManifest=loaded.inventoryManifest;
        packet.declarationInventoryComplete = false;
        packet.checkpoints!.declarations = true;
        packet.captureProgress!.declarationsAtMs=Date.now()-started;
        packet.limitations.push("loaded_configuration_not_visibility_proof");
        if (loaded.truncated) packet.limitations.push("cmp_inventory_bounded");
        if (loaded.unresolved) packet.limitations.push("cmp_inventory_detail_unresolved");
      }
    }
    };
    const borlabs = detectedIndex !== undefined && definitions[detectedIndex]?.preferenceInspection?.kind === "borlabs_v3" && remaining() > 250
      ? await readBorlabsPreferenceInventory(page) : undefined;
    if (borlabs) {
      await binding();
      packet.declarations = borlabs.declarations;
      packet.serviceNames = borlabs.services.filter(Boolean);
      packet.declarationCoverage = borlabs.coverage;
      packet.declarationInventoryComplete = borlabs.cookieInventoryComplete;
      if (!borlabs.cookieInventoryComplete) packet.limitations.push("configured_cookie_inventory_incomplete");
      packet.checkpoints!.declarations = true;
    packet.captureProgress!.declarationsAtMs=Date.now()-started;
    }
    if(initialControls) packet.controls=classifyControls(initialControls.controls,borlabs??oneTrust);
    // Completed core checkpoints precede whole-document link work. The
    // hit test must still occur before Options to retain its original meaning.
    await capturePrivacyLinks();
    if (!cmpReady) {
      await captureLoadedConfiguration();
      packet.support.reason = "preference_readiness_incomplete";
      packet.limitations.push("preference_readiness_incomplete");
      return finish();
    }
    const optionsResolution = { version: "cmp_options_resolution.v1" as const,
      counts: { actionable: 0, hidden: 0, disabled: 0, outside_viewport: 0, covered: 0, unavailable: 0 }, overflow: false };
    packet.inspectionDiagnostic!.optionsResolution = optionsResolution;
    for (const definitionIndex of scopeInventory.indices) {
      remaining();
      const definition = definitions[definitionIndex]!;
      // A passive Close/category recipe is not an Options action recipe. Its
      // aria-label may contain "cookie settings"; never promote that substring
      // into permission to close the widget or advance its Next control.
      if (definition.initialOptionalOffCloseObservation && !definition.preferenceInspection && !definition.preferenceDialogBinding) continue;
      const recipe = definition.preferenceInspection;
      const scope = page.locator(scopeSelectors[definitionIndex]!);
      const controlSelector = recipe?.controlSelector ?? (definition.initialOptionalOffCloseObservation ? definition.preferenceDialogBinding!.controlSelector : undefined) ?? ['button, [role="button"], input[type="button"]', definition.preferenceDialogBinding?.controlSelector].filter(Boolean).join(",");
      const primaryScope = definition.preferenceControlScopeSelector ? scope.locator(definition.preferenceControlScopeSelector) : undefined;
      // Older vendor banners without the registered action area retain the
      // existing unique-Options requirement across their whole CMP scope.
      const controlScopeSelector = primaryScope && await primaryScope.count() > 0 ? definition.preferenceControlScopeSelector : undefined;
      const controlScope = controlScopeSelector ? primaryScope! : scope;
      const controls = (definition.preferenceDialogBinding?.allowPrivacyOptOutEntrance || definition.preferenceDialogBinding?.allowExternalOptionsEntrance)
        ? page.locator(`:is(${scopeSelectors[definitionIndex]}) :is(${controlSelector}), :is(${definition.preferenceDialogBinding.controlSelector})`) : controlScope.locator(controlSelector);
      if (definition.preferenceDialogBinding?.allowPrivacyOptOutEntrance || definition.preferenceDialogBinding?.allowExternalOptionsEntrance) {
        const registered = page.locator(`:is(${definition.preferenceDialogBinding.controlSelector}):visible`);
        if (await registered.count() === 1 && await registered.isVisible()) {
          await registered.scrollIntoViewIfNeeded({ timeout: Math.min(300, remaining()) });
          await binding();
        }
      }
      const inventory = await controls.evaluateAll(readCmpOptionsInventory, { registeredSelector: definition.preferenceDialogBinding?.controlSelector });
      if (inventory.overflow) { optionsResolution.overflow = true; packet.limitations.push("control_inventory_overflow"); continue; }
      for (const [index, fields] of inventory.fields.entries()) {
        // Observation-only labels are actionable only on the exact registered
        // named-CMP Options target; never widen Accept/Reject or generic labels.
        const observedOptionsLabel = definition.preferenceDialogBinding?.allowObservedOptionsLabel === true && fields.registered;
        const result = classifyConsentControlLabel({ ...fields, hasConsentContext: true, usage: recipe || observedOptionsLabel ? "observation" : "action" });
        if (!(result.intent === "options" || definition.preferenceDialogBinding?.allowPrivacyOptOutEntrance && fields.registered && result.intent === "privacy_opt_out") || !result.contextSatisfied || result.matchStrength === "weak") continue;
        optionsResolution.counts[fields.access]++;
        const control = controls.nth(index);
        if ((definition.preferenceDialogBinding?.allowPrivacyOptOutEntrance && result.intent === "privacy_opt_out" || definition.preferenceDialogBinding?.allowExternalOptionsEntrance && fields.registered) &&
            !await control.evaluate(element => !element.closest("form") && !element.hasAttribute("form") &&
              (element.tagName === "BUTTON" && element.getAttribute("type") !== "submit" ||
               element.tagName === "A" && ["", "#"].includes(element.getAttribute("href") ?? "")))) continue;
        if (fields.access === "actionable") matches.push({ provider: definition.canonicalName, control, label: fields.ariaLabel ?? fields.title ?? fields.label, scope, recipe, dialogBinding: definition.preferenceDialogBinding, observedOptionsLabel, privacyEntrance: result.intent === "privacy_opt_out", deferredAriaBinding: definition.preferenceDeferredAriaBinding, controlScopeSelector, portalRecipe: definition.preferencePortalBinding });
      }
    }
    const ordinaryOptions = matches.filter(match => !match.privacyEntrance);
    if (ordinaryOptions.length === 1 && matches.every(match => match === ordinaryOptions[0] ||
        match.privacyEntrance && match.provider === ordinaryOptions[0]!.provider && match.dialogBinding?.dialogSelector === ordinaryOptions[0]!.dialogBinding?.dialogSelector)) {
      matches.splice(0, matches.length, ordinaryOptions[0]!);
    }
    if (matches.length !== 1) {
      await captureLoadedConfiguration();
      packet.support = { state: detected.size ? "partial" : "unknown", provider: detected.size === 1 ? [...detected][0]! : null, recipeVersion: CMP_PREFERENCE_POLICY_VERSION, reason: detected.size ? "unique_actionable_options_not_resolved" : "cmp_not_identified" };
      packet.limitations.push(packet.support.reason);
      return finish();
    }
    const match = matches[0]!;
    packet.support = { state: "partial", provider: match.provider, recipeVersion: match.recipe?.version ?? CMP_PREFERENCE_POLICY_VERSION, reason: "bounded_visible_preference_inspection" };
    const controlledId = await match.control.getAttribute("aria-controls");
    const registeredDialog = (!controlledId || match.observedOptionsLabel) && match.dialogBinding &&
      await match.control.evaluate((element, selector) => element.matches(selector), match.dialogBinding.controlSelector)
      ? match.dialogBinding : undefined;
    if (registeredDialog) packet.support.recipeVersion = registeredDialog.version;
    const portalRecipe = match.portalRecipe && await match.control.evaluate((e, selector) => e.matches(selector), match.portalRecipe.controlSelector) ? match.portalRecipe : undefined;
    const portal = portalRecipe ? await preparePreferencePortal(page, match.control, portalRecipe) : null;
    if (portalRecipe && !portal) { packet.limitations.push("preference_portal_binding_unavailable"); packet.support.reason = "preference_portal_binding_unavailable"; return finish(); }
    if (portal) packet.support.recipeVersion = portal.recipe.version;
    const controlled = portal ? page.locator(portal.recipe.panelSelector) : match.recipe ? page.locator(match.recipe.dialogSelector)
      : registeredDialog ? page.locator(registeredDialog.dialogSelector)
      : controlledId && /^[A-Za-z][\w:-]{0,120}$/.test(controlledId) ? page.locator(`[id="${controlledId}"]`) : null;
    packet.inspectionDiagnostic!.phase = "surface_binding";
    const priorMatches = controlled ? await controlled.count() : 0;
    const surfaceBinding: NonNullable<NonNullable<CmpPreferencesEvidence["inspectionDiagnostic"]>["surfaceBinding"]> = {
      version: "cmp_surface_binding.v1", mode: match.recipe ? "borlabs" : registeredDialog ? "registered_existing" : "aria_controls",
      priorMatches: Math.min(priorMatches, 1000), outcome: "checking",
    };
    packet.inspectionDiagnostic!.surfaceBinding = surfaceBinding;
    const stopBinding = async (outcome: typeof surfaceBinding.outcome, reason: string) => {
      surfaceBinding.outcome = outcome; packet.support.reason = reason; packet.limitations.push(reason);
      await captureLoadedConfiguration?.();
      return finish();
    };
    if (!controlled || priorMatches > 1 || (match.recipe && await match.scope.count() !== 1)) {
      return await stopBinding(priorMatches > 1 ? "ambiguous" : "missing", priorMatches > 1 ? "preference_surface_ambiguous" : "preference_surface_binding_unavailable");
    }
    // A registered CMP button may create its panel on opening. Bind that
    // transition to the exact existing vendor root, never to a guessed new modal.
    const deferredRootSelector = registeredDialog?.deferredRootSelector ?? (!match.recipe && controlledId ? match.deferredAriaBinding?.rootSelector : undefined);
    const deferredRoot = (priorMatches === 0 || match.observedOptionsLabel || registeredDialog?.deferredRootSelector) && deferredRootSelector
      ? page.locator(deferredRootSelector) : undefined;
    // Resolve independent retained handles concurrently. Each remains subject
    // to the original unique-count and dispatch-time identity checks. On busy
    // pages serial protocol round trips consumed the optional opening reserve.
    const tab = registeredDialog?.tabSelector ? page.locator(registeredDialog.tabSelector) : undefined;
    const [deferredRootHandle, initialTabHandle, dialogHandle, beforeVisible] = await Promise.all([
      deferredRoot ? deferredRoot.count().then(count => count === 1 ? deferredRoot.elementHandle() : null) : null,
      tab ? tab.count().then(count => count === 1 ? tab.elementHandle() : null) : null,
      priorMatches === 1 ? controlled.elementHandle() : null,
      priorMatches === 1 ? controlled.isVisible() : false,
    ]);
    let boundTab: Awaited<ReturnType<Locator["elementHandle"]>> = null;
    if (registeredDialog?.tabSelector) {
      if (priorMatches !== 1) return await stopBinding("missing", "preference_surface_missing");
      boundTab = initialTabHandle;
      if (!deferredRootHandle || !boundTab || !await match.control.evaluate((element, root) => root?.isConnected && root.contains(element), deferredRootHandle) ||
          !await boundTab.evaluate((element, expected) => expected.root?.isConnected && expected.root.contains(element) &&
            element.getAttribute("role") === "tab" && element.getAttribute("aria-selected") === "false" &&
            element.getAttribute("aria-controls") === expected.panelId,
            {root:deferredRootHandle,panelId:await controlled.getAttribute("id")}))
        return await stopBinding("parent_unbound", "preference_parent_binding_unavailable");
    }
    if (match.observedOptionsLabel && (!deferredRootHandle || !await match.control.evaluate((element, root) => Boolean(root?.isConnected && root.contains(element)), deferredRootHandle)))
      return await stopBinding("parent_unbound", "preference_parent_binding_unavailable");
    if (priorMatches === 0) {
      if (!portal && (!deferredRootHandle || !registeredDialog?.allowExternalOptionsEntrance && !await match.control.evaluate((element, root) => Boolean(root?.isConnected && root.contains(element)), deferredRootHandle))) {
        return await stopBinding(deferredRoot ? "parent_unbound" : "missing", deferredRoot ? "preference_parent_binding_unavailable" : "preference_surface_missing");
      }
      surfaceBinding.mode = portal ? "registered_portal" : "registered_deferred";
      if (!registeredDialog && match.deferredAriaBinding) packet.support.recipeVersion = match.deferredAriaBinding.version;
    }
    surfaceBinding.priorVisible = beforeVisible;
    const layerSelector = registeredDialog?.layerTransitionSelector;
    let layerControl: Awaited<ReturnType<Locator["elementHandle"]>> = null;
    if (layerSelector) {
      // Bind an already-visible named-CMP dialog before its content transition.
      // Existing category content is not proof that this action opened it.
      if (!beforeVisible || !dialogHandle || await controlled.locator(layerSelector).count() !== 0)
        return await stopBinding("already_visible", "preference_surface_already_visible");
      layerControl = await match.control.elementHandle();
      if (!layerControl || !await layerControl.evaluate((element, dialog) => Boolean(dialog?.isConnected && dialog.contains(element)), dialogHandle))
        return await stopBinding("parent_unbound", "preference_parent_binding_unavailable");
      surfaceBinding.mode = "registered_layer";
    } else if (!match.recipe && beforeVisible) return await stopBinding("already_visible", "preference_surface_already_visible");
    surfaceBinding.outcome = "ready";
    await binding();
    const dispatchFields = await match.control.evaluate((element, expected) => {
      let portalBound = true;
      if (expected.portal) {
        let sdk: unknown = window;
        for (const key of expected.portal.path) {
          if (!sdk || !["object", "function"].includes(typeof sdk)) { portalBound = false; break; }
          const descriptor = Object.getOwnPropertyDescriptor(sdk, key);
          sdk = descriptor && "value" in descriptor ? descriptor.value : null;
        }
        let ancestor: Element | null = element;
        for (let depth = 0; ancestor && ancestor !== expected.portal.root && depth < 32; depth++) {
          const tree = ancestor.getRootNode();
          ancestor = ancestor.parentElement ?? (tree instanceof ShadowRoot ? tree.host : null);
        }
        portalBound = portalBound && sdk === expected.portal.sdk && element === expected.portal.control &&
          expected.portal.root.isConnected && ancestor === expected.portal.root &&
          document.querySelector(expected.portal.rootSelector) === expected.portal.root;
      }
      const fields = { label: (element.textContent ?? "").trim(), ariaLabel: element.getAttribute("aria-label"), title: element.getAttribute("title"), value: (element as HTMLInputElement).value, controls: element.getAttribute("aria-controls"),
        registered: (!expected.selector || element.matches(expected.selector)) && (!expected.controlScopeSelector || Boolean(element.closest(expected.controlScopeSelector))),
        parentBound: !expected.root || Boolean(expected.root.isConnected && (expected.root.contains(element) ||
          expected.externalEntrance && element.matches(expected.selector!) && (expected.deferredExternalOptions || expected.dialog?.isConnected && expected.root.contains(expected.dialog)))),
        layerBound: !expected.layerControl || Boolean(element === expected.layerControl && expected.layerDialog?.isConnected && expected.layerDialog.contains(element)) };
      let ancestor: Element | null = element, accessible = true;
      const deadline = performance.now() + 50;
      for (let depth = 0; ancestor && depth < 64; depth++) {
        const style = getComputedStyle(ancestor);
        if (performance.now() >= deadline || style.display === "none" || style.visibility !== "visible" || style.opacity === "0" ||
            ancestor.matches('[hidden], [aria-hidden="true" i], [inert]') || ancestor === element && style.pointerEvents === "none") { accessible = false; break; }
        const root = ancestor.getRootNode();
        ancestor = ancestor.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
      return { ...fields, portalBound, accessible: accessible && !ancestor };
    }, { selector: match.observedOptionsLabel ? match.dialogBinding?.controlSelector : registeredDialog?.controlSelector, root: deferredRootHandle, externalEntrance: registeredDialog?.allowExternalOptionsEntrance === true || registeredDialog?.allowPrivacyOptOutEntrance === true && priorMatches === 1, deferredExternalOptions: registeredDialog?.allowExternalOptionsEntrance === true && priorMatches === 0, dialog: dialogHandle, controlScopeSelector: match.controlScopeSelector, layerControl, layerDialog: layerControl ? dialogHandle : null, portal: portal ? { path: portal.recipe.sdkPath, sdk: portal.sdk, root: portal.rootHandle, control: portal.controlHandle, rootSelector: portal.recipe.rootSelector } : null });
    const dispatchIntent = classifyConsentControlLabel({ ...dispatchFields, hasConsentContext: true, usage: match.recipe || match.observedOptionsLabel && dispatchFields.registered ? "observation" : "action" });
    if (!(dispatchIntent.intent === "options" || match.dialogBinding?.allowPrivacyOptOutEntrance && dispatchFields.registered && dispatchIntent.intent === "privacy_opt_out") || !dispatchIntent.contextSatisfied || dispatchIntent.matchStrength === "weak" || dispatchFields.controls !== controlledId || !dispatchFields.registered || !dispatchFields.parentBound || !dispatchFields.layerBound || !dispatchFields.portalBound || !dispatchFields.accessible) throw new Error("preference_control_changed");
    // Opening is optional depth, not permission to consume the entire lane.
    // Share one cap across dispatch, visibility and accessible-name hydration,
    // leaving room to inspect a verified panel and retain earlier checkpoints.
    const openingAllowance = optionalEvidenceAllowance({ remainingMs: remaining(),
      maximumMs: Math.min(registeredDialog?.openingBudgetMs ?? (portal ? EVIDENCE_WORK_POLICY.preferences.registeredLazyPanelOpeningBudgetMs : EVIDENCE_WORK_POLICY.preferences.panelOpeningBudgetMs),
        EVIDENCE_WORK_POLICY.preferences.registeredLazyPanelOpeningBudgetMs),
      requiredReserveMs: EVIDENCE_WORK_POLICY.preferences.basicCaptureReserveMs });
    if (!openingAllowance) return await stopBinding("timed_out", "preference_budget_exhausted");
    packet.inspectionDiagnostic!.openingTiming = {startedAtMs: Date.now() - started};
    const openingDeadline = Date.now() + openingAllowance;
    const openingRemaining = () => {
      remaining();
      if (Date.now() >= openingDeadline) throw new Error("preference_opening_budget_exhausted");
      return Math.max(1, openingDeadline - Date.now());
    };
    packet.inspectionDiagnostic!.phase = "opening";
    packet.inspectionDiagnostic!.openingStage = "dispatch";
    await dispatchLocatorClickWithVerifiedGeometry(match.control, Math.min(500, openingRemaining()), () => {
      remaining();
      if (page.url() !== exactDocumentUrl || packet.action.count !== 0) throw new Error("preference_action_not_authorized");
      packet.inspectionDiagnostic!.openingTiming!.dispatchedAtMs = Date.now() - started;
      packet.action.count = 1; packet.action.label = match.label.slice(0, 160);
    });
    packet.inspectionDiagnostic!.openingTiming!.clickCompletedAtMs = Date.now() - started;
    packet.inspectionDiagnostic!.openingStage = "panel_visibility";
    if (layerSelector && layerControl) {
      // The original Options node must disappear, and the registered category
      // container must appear inside the exact same retained dialog. No Save,
      // Accept, Reject, second click, or arbitrary replacement panel is allowed.
      await layerControl.waitForElementState("hidden", { timeout: openingRemaining() });
      await controlled.locator(layerSelector).first().waitFor({ state: "visible", timeout: openingRemaining() });
      if (await controlled.locator(layerSelector).count() !== 1) throw new Error("preference_surface_ambiguous");
    }
    if (match.recipe) {
      // Borlabs replaces the entrance inside the same dialog. No second click,
      // API opening call or arbitrary newly visible modal can establish binding.
      await match.scope.waitFor({ state: "hidden", timeout: openingRemaining() });
      if (!beforeVisible || !dialogHandle || !await controlled.evaluate((element, previous) => element === previous && element.isConnected, dialogHandle)) throw new Error("preference_surface_changed");
    }
    // Waiting on presence does not select a panel for inspection. Recheck exact
    // uniqueness before accepting any opening or reading preference evidence.
    let portalPanel: Awaited<ReturnType<Locator["elementHandle"]>> = null;
    if (portal) {
      packet.inspectionDiagnostic!.openingStage = "content_ready";
      await waitForPreferencePortalContent(page, portal.recipe, openingRemaining());
      packet.inspectionDiagnostic!.openingTiming!.panelVisibleAtMs = Date.now() - started;
      packet.inspectionDiagnostic!.openingTiming!.contentReadyAtMs = Date.now() - started;
      portalPanel = await controlled.elementHandle();
      packet.inspectionDiagnostic!.openingStage = "binding_verification";
      if (!portalPanel || !await verifyPreferencePortal(page, controlled, portal, portalPanel)) throw new Error("preference_surface_changed");
      surfaceBinding.verification = { version: "cmp_panel_verification.v1", result: "verified", role: await controlled.getAttribute("role") };
    } else {
      await controlled.first().waitFor({ state: "visible", timeout: openingRemaining() });
      if (await controlled.count() !== 1) throw new Error("preference_surface_ambiguous");
      packet.inspectionDiagnostic!.openingTiming!.panelVisibleAtMs = Date.now() - started;
    }
    if (!portal && surfaceBinding.mode === "registered_deferred") {
      if (!deferredRoot || !deferredRootHandle) throw new Error("preference_surface_changed");
      surfaceBinding.verification = await verifyDeferredPreferencePanel({ panel: controlled, parent: deferredRootHandle,
        roles: registeredDialog?.dialogRoles ?? (match.deferredAriaBinding ? ["dialog", "region", "tabpanel"] : ["dialog", "region"]), remainingMs: Math.max(0, openingRemaining() - 25) });
      if (surfaceBinding.verification.result === "verified") {
        if (await deferredRoot.count() !== 1) surfaceBinding.verification.result = "parent_ambiguous";
        else if (await controlled.count() !== 1) surfaceBinding.verification.result = "panel_ambiguous";
        else if (!await deferredRoot.evaluate((element, previous) => element === previous && element.isConnected, deferredRootHandle)) surfaceBinding.verification.result = "parent_missing_or_replaced";
      }
      if (surfaceBinding.verification.result !== "verified") throw new Error(
        ["role_not_ready", "name_not_ready"].includes(surfaceBinding.verification.result)
          ? "preference_opening_budget_exhausted" : "preference_surface_changed");
    } else if (!portal && (!dialogHandle || !await controlled.evaluate((element, previous) => element === previous && element.isConnected, dialogHandle))) throw new Error("preference_surface_changed");
    if (boundTab && registeredDialog && deferredRoot && deferredRootHandle) {
      if (await deferredRoot.count() !== 1 || !await deferredRoot.evaluate((element, previous) => element === previous && element.isConnected, deferredRootHandle) ||
          !await boundTab.evaluate((element, expected) => element.isConnected && expected.root.contains(element) &&
            element.getAttribute("aria-selected") === "true" && element.getAttribute("aria-controls") === expected.panel.id &&
            expected.panel.getAttribute("aria-labelledby") === element.id,
            {root:deferredRootHandle,panel:dialogHandle!})) throw new Error("preference_surface_changed");
      surfaceBinding.verification = await verifyDeferredPreferencePanel({panel:controlled,parent:deferredRootHandle,
        roles:registeredDialog.dialogRoles ?? ["tabpanel"],remainingMs:Math.max(0,openingRemaining()-25)});
      if (surfaceBinding.verification.result !== "verified") throw new Error("preference_surface_changed");
    }
    if (match.observedOptionsLabel && (!deferredRoot || !deferredRootHandle || await deferredRoot.count() !== 1 ||
        !await controlled.evaluate((element, root) => Boolean(root?.isConnected && root.contains(element)), deferredRootHandle))) throw new Error("preference_surface_changed");
    await binding();
    packet.inspectionDiagnostic!.openingStage = "completed";
    surfaceBinding.outcome = "opened";
    packet.action.opened = true;
    packet.inspectionDiagnostic!.phase = "preference_inventory";
    const inventoryDefinition = definitions.find(definition => definition.canonicalName === match.provider);
    const categoryRecipe = inventoryDefinition?.preferenceCategoryInventory;
    const raw = await readPreferenceControls(controlled, categoryRecipe, inventoryDefinition?.initialOptionalOffCloseObservation?.inputSelector);
    if (raw.controls.some(control => control.registeredCategory || control.registeredService)) packet.support.recipeVersion = categoryRecipe!.version;
    await binding();
    if (portal && (!portalPanel || !await verifyPreferencePortal(page, controlled, portal, portalPanel))) throw new Error("preference_document_changed");
    packet.controls = classifyControls(raw.controls, borlabs ?? oneTrust);
    packet.checkpoints!.controls = true;
    packet.captureProgress!.controlsAtMs=Date.now()-started;
    packet.checkpoints!.controlsSurface = "preferences";
    // Visible toggles establish presence, not completeness of collapsed tabs,
    // lazy service lists, closed shadow roots, or inaccessible frames.
    const incompleteSections = match.recipe ? 1 : await controlled.locator('iframe, [aria-expanded="false"], details:not([open]), [hidden], [role="tab"][aria-selected="false"]').count();
    const documentReady = await page.evaluate(() => document.readyState !== "loading");
    if (!documentReady) packet.limitations.push("preference_document_loading");
    packet.controlInventoryComplete = documentReady && !match.recipe && !raw.overflow && incompleteSections === 0 && raw.controls.every(control => control.visible) && packet.controls.every(control => control.kind !== "unclassified");
    if (!packet.controlInventoryComplete) packet.limitations.push(raw.overflow ? "control_inventory_overflow" : match.recipe ? "bounded_vendor_preference_inventory" : "deeper_preference_sections_not_opened");
    // Verified live controls are checkpointed before optional API/declaration
    // work. An expensive configuration read must not consume the opening slot.
    await captureLoadedConfiguration();
    packet.controls=classifyControls(raw.controls,borlabs??oneTrust);
    if (!borlabs) {
      const visibleInventory = await readVisibleCmpInventory(controlled);
      await binding();
      if (portal && (!portalPanel || !await verifyPreferencePortal(page, controlled, portal, portalPanel))) throw new Error("preference_document_changed");
      packet.visibleInventory = visibleInventory;
      for (const row of projectVisibleCmpInventory(visibleInventory).declarations)
        if (!packet.declarations.some(existing => existing.name === row.name && existing.purpose === row.purpose && existing.duration === row.duration && existing.source === row.source)) packet.declarations.push(row);
      if (visibleInventory.truncated) packet.limitations.push("cookie_inventory_overflow");
      if (visibleInventory.unresolvedRecords) packet.limitations.push("visible_inventory_records_unresolved");
    }

    if (inventoryDefinition?.preferenceLoadedInventory) {
      const loaded = await readCookiebotLoadedInventory(controlled, inventoryDefinition.preferenceLoadedInventory, 100 - packet.declarations.length);
      await binding();
      if (!dialogHandle || !await controlled.evaluate((panel, original) => panel === original && panel.isConnected, dialogHandle)) throw new Error("preference_surface_changed");
      packet.loadedInventory = loaded;
      packet.inventoryManifest=loaded.inventoryManifest;
      packet.declarations.push(...projectLoadedCmpInventory(loaded).declarations);
      packet.limitations.push("loaded_declarations_not_visibility_proof", "declaration_inventory_not_complete");
      if (loaded.truncated) packet.limitations.push("cookie_inventory_overflow");
    }

    if (packet.declarations.length > 100) { packet.declarations = packet.declarations.slice(0, 100); packet.declarationInventoryComplete = false; packet.limitations.push("cookie_inventory_overflow"); }
    // A table can be compared as a retained declaration sample. A visible
    // sample is not proof of the CMP's entire dynamic inventory.
    if (!borlabs) packet.declarationInventoryComplete = false;
    await binding();
    if (portal && (!portalPanel || !await verifyPreferencePortal(page, controlled, portal, portalPanel))) throw new Error("preference_document_changed");
    packet.checkpoints!.declarations = true;
    packet.captureProgress!.declarationsAtMs=Date.now()-started;
    const auditBudget=optionalEvidenceAllowance({remainingMs:remaining(),maximumMs:800,requiredReserveMs:EVIDENCE_WORK_POLICY.preferences.basicCaptureReserveMs});
    if(auditBudget&&registeredDialog){
      packet.accessibilityAudit=await inspectPreferenceAccessibility({page,panel:controlled,panelSelector:registeredDialog.dialogSelector,scanId:config.scanId,
        documentUrl:packet.finalUrl!,documentToken:packet.documentToken!,budgetMs:auditBudget,verify:binding});
      await binding();
    }
    packet.status = "completed";
    packet.inspectionDiagnostic!.phase = "completed";
    return finish();
  } catch (error) {
    // Failed/ambiguous opening still preserves available basic declarations.
    // This runs only in unused original allowance and never after invalidation.
    if(!expired&&!input.signal?.aborted&&Date.now()+250<deadline&&packet.documentToken&&
       !(error instanceof Error&&error.message==='preference_document_changed')) {
      try{await captureLoadedConfiguration?.();}catch{/* Original failure remains authoritative. */}
    }
    packet.executionDiagnostic = describeCaptureFailure(error, packet.inspectionDiagnostic!.phase);
    packet.status = "limited";
    if (!packet.checkpoints?.controls) { packet.controls = []; packet.action.opened = false; }
    packet.controlInventoryComplete = false;
    if (!packet.checkpoints?.declarations) { packet.visibleInventory = undefined; packet.loadedInventory = undefined; packet.inventoryManifest=undefined; packet.declarations = packet.declarations.filter(row => row.source !== "cmp_loaded_inventory"); }
    const budgetExhausted = expired || Date.now() >= deadline || (error instanceof Error && error.message === "preference_budget_exhausted");
    const operationTimedOut = error instanceof Error && error.name === "TimeoutError";
    const openingTimedOut = error instanceof Error && error.message === "preference_opening_budget_exhausted";
    const timedOut = budgetExhausted || operationTimedOut || openingTimedOut;
    const bindingFailure = error instanceof Error && ["preference_surface_changed", "preference_surface_ambiguous", "preference_document_changed", "preference_control_changed"].includes(error.message) ? error.message : null;
    const reason = budgetExhausted ? "preference_budget_exhausted" : input.signal?.aborted ? "preference_inspection_cancelled"
      : operationTimedOut || openingTimedOut ? "preference_operation_timed_out" : bindingFailure ?? "preference_inspection_incomplete";
    if (packet.inspectionDiagnostic?.surfaceBinding && !packet.action.opened) {
      packet.inspectionDiagnostic.surfaceBinding.outcome = timedOut ? "timed_out" : reason === "preference_surface_ambiguous" ? "ambiguous" : "changed";
    }
    packet.support.reason = reason;
    packet.limitations.push(reason);
    return finish();
  } finally {
    clearTimeout(timer); input.signal?.removeEventListener("abort", abort);
    if (boundedCoverage) {
      // Shutdown must not consume the artifact reserve and discard completed
      // checkpoints. Both close requests are issued; retention can proceed once
      // the reserved cleanup interval expires, without restarting capture.
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.all([context?.close().catch(() => undefined), !input.browser ? browser?.close().catch(() => undefined) : undefined]),
        new Promise<void>(resolve => { cleanupTimer = setTimeout(resolve, 250); }),
      ]);
      if (cleanupTimer) clearTimeout(cleanupTimer);
    } else {
      await context?.close().catch(() => undefined);
      if (!input.browser) await browser?.close().catch(() => undefined);
    }
  }
  function finish() {
    packet.completedAt = new Date().toISOString();
    packet.limitations = [...new Set(packet.limitations)].slice(0, 24);
    return cmpPreferencesEvidenceSchema.parse(packet);
  }
}

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
