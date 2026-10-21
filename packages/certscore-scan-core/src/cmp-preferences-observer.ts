import { chromium, type Browser, type BrowserContext } from "playwright";
import { cmpPreferenceDispatchSchema, cmpPreferenceBudgetMs, cmpPreferencesEvidenceSchema, describeCaptureFailure,
  projectVisibleCmpInventory, type CmpPreferenceDispatch, type CmpPreferencesEvidence } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { chromiumContextOptions, chromiumLaunchOptions } from "./playwright-runtime.js";
import { installPublicNetworkGuardRoute } from "./public-network-guard.js";
import { installWebBotAuthRoute } from "./web-bot-auth-routing.js";
import { classifyConsentGeometryAccess } from "./consent-geometry-access.js";
import { bindPostRefusalBrowserResolvedExactTarget, RESOLVED_SCAN_TARGET_AUTHORIZATION_ID } from "./post-refusal-target-authorization.js";
import { cmpInventoryScopeSelector, readCmpScopeInventory } from "./cmp-scope-inventory.js";
import { readCookieYesPreferenceInventory } from "./cookieyes-preference-inventory.js";
import { readVisibleCmpInventory, projectVisibleCmpInventoryRead } from "./cmp-visible-inventory.js";
import { readPrivacyLinkAccess, privacyPolicyLinkCandidates } from "./privacy-link-access.js";
import { classifyControls, readBorlabsPreferenceInventory, readPreferenceControls } from "./cmp-preference-inventory-readers.js";
export { classifyControls, readBorlabsPreferenceInventory, readPreferenceControls } from "./cmp-preference-inventory-readers.js";

/** Passive inventory in the existing optional visit. No UI action, SDK opening
 * call, preference navigation, form submission or panel expansion is performed. */
export async function runCmpPreferencesObserver(input: {
  config: CmpPreferenceDispatch; parentDispatchSha256: string; signal?: AbortSignal;
  browser?: Browser; deadlineAtMs?: number;
}): Promise<CmpPreferencesEvidence> {
  const config = cmpPreferenceDispatchSchema.parse(input.config), started = Date.now();
  const budgetMs = cmpPreferenceBudgetMs(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE === undefined
    ? (process.env.AWS_LAMBDA_FUNCTION_NAME ? NaN : 3008) : Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE), config.computeBudgetPolicy);
  const bounded = config.computeBudgetPolicy === "coverage_25_gb_seconds.v1";
  const allowance = Math.max(1, Math.min(budgetMs - (bounded ? 500 : 0), (input.deadlineAtMs ?? Infinity) - started - 250));
  const deadline = started + allowance;
  const packet: CmpPreferencesEvidence = {
    contractVersion: "certscore.cmp-preferences-evidence.v1", policyVersion: "bounded_cmp_preferences.v1",
    captureMode: "passive_cmp_inventory.v1", scanId: config.scanId, parentDispatchSha256: input.parentDispatchSha256,
    targetUrl: config.exactTargetUrl, finalUrl: null, documentToken: null, startedAt: new Date(started).toISOString(),
    completedAt: new Date(started).toISOString(), status: "limited",
    support: { state: "unknown", provider: null, recipeVersion: null, reason: "passive_inventory_unavailable" },
    action: { count: 0, intent: "options", label: null, opened: false }, controls: [], controlInventoryComplete: false,
    privacyLinks: [], declarations: [], declarationInventoryComplete: false,
    limitations: ["passive_inventory_only", "deeper_preference_sections_not_opened"],
    inspectionDiagnostic: { revision: "cmp_preferences.v19", budgetMs, basicCaptureReserveMs: Math.min(1000, Math.floor(budgetMs / 3)), phase: "browser_start" },
  };
  let browser = input.browser, context: BrowserContext | undefined, expired = false;
  const cancel = () => { void context?.close().catch(() => undefined); if (!input.browser) void browser?.close().catch(() => undefined); };
  const timer = setTimeout(() => { expired = true; cancel(); }, allowance);
  input.signal?.addEventListener("abort", cancel, { once: true });
  const remaining = () => {
    if (input.signal?.aborted) throw new Error("preference_inspection_cancelled");
    if (expired || Date.now() >= deadline) throw new Error("preference_budget_exhausted");
    return deadline - Date.now();
  };
  const finish = () => {
    packet.completedAt = new Date().toISOString(); packet.limitations = [...new Set(packet.limitations)].slice(0, 24);
    return cmpPreferencesEvidenceSchema.parse(packet);
  };
  const invalidate = () => {
    packet.documentToken = null; packet.checkpoints = undefined; packet.captureProgress = undefined;
    packet.navigationBinding = undefined; packet.configuredConsentCookies = undefined; packet.configuredCategories = undefined;
    packet.controls = []; packet.privacyLinks = []; packet.declarations = []; packet.serviceNames = undefined;
    packet.serviceDisclosures = undefined; packet.declarationCoverage = undefined; packet.inventoryManifest = undefined;
    packet.visibleInventory = undefined; packet.status = "limited";
  };
  try {
    remaining(); browser ??= await chromium.launch({ ...chromiumLaunchOptions({ headless: true }), timeout: remaining() });
    context = await browser.newContext(chromiumContextOptions());
    await installWebBotAuthRoute(context); await installPublicNetworkGuardRoute(context);
    const page = await context.newPage(); page.setDefaultTimeout(remaining());
    let navigationCount = 0, exactUrl: string | null = null;
    page.on("request", request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigationCount++; });
    await context.route("**/*", async route => {
      const request = route.request();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame() &&
        (exactUrl ? request.url() !== exactUrl : navigationCount > 9 || request.url() !== config.exactTargetUrl && !request.url().startsWith("https://"))) await route.abort();
      else await route.fallback();
    });
    packet.inspectionDiagnostic!.phase = "navigation";
    const response = await page.goto(config.exactTargetUrl, { waitUntil: "commit", timeout: remaining() });
    const httpStatus = response?.status(); packet.inspectionDiagnostic!.navigationHttpStatus = httpStatus;
    const access = classifyConsentGeometryAccess({ httpStatus });
    if (!["loaded", "unknown"].includes(access.status)) {
      packet.support.reason = "preference_page_access_limited"; packet.limitations.push(...access.reasonCodes); return finish();
    }
    exactUrl = config.exactTargetUrl;
    if (page.url() !== exactUrl) {
      const resolution = await bindPostRefusalBrowserResolvedExactTarget({ requestedUrl: exactUrl, finalUrl: page.url(), redirectCount: Math.max(0, navigationCount - 1), durationMs: Date.now() - started },
        { authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID, kind: "scan_target_resolution", requestedUrl: exactUrl, scanId: config.scanId, maxRedirects: 8, resolutionTimeoutMs: allowance }, config.scanId);
      if (resolution.status !== "resolved") throw new Error("preference_redirect_unverified");
      exactUrl = resolution.targetUrl;
    }
    const session = await context.newCDPSession(page); let loader: string | null = null;
    session.on("Page.frameNavigated", ({ frame }) => { if (!frame.parentId) { loader = frame.loaderId; if (packet.documentToken && loader !== packet.documentToken) invalidate(); } });
    await session.send("Page.enable"); const frame = (await session.send("Page.getFrameTree")).frameTree.frame;
    loader = frame.loaderId; packet.documentToken = frame.loaderId; packet.finalUrl = page.url();
    if (exactUrl !== config.exactTargetUrl) packet.navigationBinding = { policyVersion: "passive_redirect_exact_document.v1", requestedUrl: config.exactTargetUrl, finalUrl: exactUrl, documentToken: frame.loaderId, redirectCount: Math.max(0, navigationCount - 1) };
    const binding = () => {
      remaining(); if (!packet.documentToken || loader !== packet.documentToken || page.url() !== exactUrl) { invalidate(); throw new Error("preference_document_changed"); }
    };
    packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: frame.loaderId, controls: false, declarations: false, privacyLinks: false, controlsSurface: "first_layer" };
    packet.captureProgress = { version: "cmp_capture_checkpoints.v1", documentToken: frame.loaderId };
    const definitions = KNOWN_CMP_REGISTRY.filter(d => d.domSelectors?.length || d.preferenceScopeSelector);
    // Capture available SDK data immediately. At most one existing readiness
    // checkpoint may supply late data; there is no second navigation or fresh timeout.
    packet.inspectionDiagnostic!.phase = "control_inventory";
    let scopes = await readCmpScopeInventory(page, definitions, true); binding();
    if (!scopes.overflow && (scopes.indices.length === 0 && scopes.configurationIndices.length === 0 || scopes.configurationIndices.length === 1 && !scopes.oneTrustInventory) && remaining() > 1250) {
      packet.inspectionDiagnostic!.phase = "cmp_readiness";
      await page.waitForLoadState("domcontentloaded", { timeout: Math.min(750, remaining() - 1000) }).catch(() => undefined);
      binding(); scopes = await readCmpScopeInventory(page, definitions, true); binding();
    }
    packet.inspectionDiagnostic!.identityScopes = { version: "cmp_scope_activity.v1", providers: scopes.scopeStates.map(s => ({ provider: definitions[s.index]!.canonicalName, state: s.state })) };
    const indices = scopes.indices.length ? scopes.indices : scopes.configurationIndices;
    if (scopes.overflow || indices.length !== 1) {
      packet.support.reason = scopes.overflow ? "control_inventory_overflow" : indices.length ? "cmp_identity_ambiguous" : "cmp_not_identified";
      return finish();
    }
    const definition = definitions[indices[0]!]!;
    packet.support = { state: "partial", provider: definition.canonicalName, recipeVersion: "passive_cmp_inventory.v1", reason: "passive_inventory_only" };
    packet.configuredConsentCookies = scopes.configuredConsentCookies;
    const scope = page.locator(cmpInventoryScopeSelector(definition));
    // Inventory precedes slower link inspection; every completed source gets
    // its own loader-bound checkpoint before another browser operation starts.
    const inventory = definition.canonicalName === "OneTrust" ? scopes.oneTrustInventory
      : definition.preferenceInspection?.kind === "borlabs_v3" ? await readBorlabsPreferenceInventory(page)
      : definition.preferenceInventory === "cookieyes_loaded_configuration.v1" ? await readCookieYesPreferenceInventory(page) : undefined;
    binding();
    if (inventory) {
      packet.declarations = inventory.declarations; packet.serviceNames = "services" in inventory ? inventory.services : [];
      packet.inventoryManifest = "inventoryManifest" in inventory ? inventory.inventoryManifest : undefined;
      packet.serviceDisclosures = "serviceDisclosures" in inventory ? inventory.serviceDisclosures : undefined;
      packet.declarationCoverage = "coverage" in inventory ? inventory.coverage : undefined;
      if (definition.canonicalName === "OneTrust") packet.configuredCategories = inventory.categories.slice(0, 64);
      packet.checkpoints!.declarations = true; packet.captureProgress!.declarationsAtMs = Date.now() - started;
      packet.limitations.push("loaded_configuration_not_visibility_proof");
    }
    if (scopes.indices.length === 1 && remaining() > 250) {
      const controls = scopes.surface?.controls ?? await readPreferenceControls(scope, definition.preferenceCategoryInventory, definition.initialOptionalOffCloseObservation?.inputSelector);
      binding(); packet.controls = classifyControls(controls.controls); packet.checkpoints!.controls = true;
      packet.captureProgress!.controlsAtMs = Date.now() - started;
      if (controls.overflow) packet.limitations.push("control_inventory_overflow");
      const visible = scopes.surface?.visibleInventory ? projectVisibleCmpInventoryRead(scopes.surface.visibleInventory) : await readVisibleCmpInventory(scope);
      binding();
      if (visible.records.length) {
        packet.visibleInventory = visible;
        for (const row of projectVisibleCmpInventory(visible).declarations) if (!packet.declarations.some(r => r.name === row.name && r.purpose === row.purpose && r.duration === row.duration) && packet.declarations.length < 100) packet.declarations.push(row);
        packet.checkpoints!.declarations = true; packet.captureProgress!.declarationsAtMs = Date.now() - started;
      }
    }
    if (remaining() > 250) {
      const links = await page.locator("a[href]").evaluateAll(nodes => nodes.slice(0, 300).map((node, index) => ({ index, url: (node as HTMLAnchorElement).href, label: (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().slice(0, 160) })));
      const candidates = privacyPolicyLinkCandidates(links);
      const checked = await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, { candidates, allowOneDocumentScroll: false });
      binding(); packet.privacyLinks = checked.map(({ url, hitTargetBeforeAction, access }) => ({ url, hitTargetBeforeAction, access }));
      packet.checkpoints!.privacyLinks = true; packet.captureProgress!.privacyLinksAtMs = Date.now() - started;
    }
    binding(); packet.status = "completed"; packet.inspectionDiagnostic!.phase = "completed"; return finish();
  } catch (error) {
    packet.status = "limited"; packet.executionDiagnostic = describeCaptureFailure(error, packet.inspectionDiagnostic!.phase);
    packet.support.reason = input.signal?.aborted ? "preference_inspection_cancelled" : expired || Date.now() >= deadline ? "preference_budget_exhausted"
      : error instanceof Error && error.message === "preference_document_changed" ? "preference_document_changed" : "preference_inspection_incomplete";
    packet.limitations.push(packet.support.reason); return finish();
  } finally {
    clearTimeout(timer); input.signal?.removeEventListener("abort", cancel);
    let cleanup: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.all([context?.close().catch(() => undefined), !input.browser ? browser?.close().catch(() => undefined) : undefined]),
      new Promise<void>(resolve => { cleanup = setTimeout(resolve, 250); })]);
    if (cleanup) clearTimeout(cleanup);
  }
}
