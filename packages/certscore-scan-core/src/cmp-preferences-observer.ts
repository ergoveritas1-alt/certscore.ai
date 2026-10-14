import { waitForConsentDocumentReady } from "./consent-document-readiness.js";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { cmpPreferenceBudgetMs, CMP_PREFERENCE_POLICY_VERSION, classifyConsentControlLabel, classifyConsentPreferenceControl, classifyPrivacySurface, cmpPreferenceDispatchSchema, cmpPreferencesEvidenceSchema, type CmpPreferenceDispatch, type CmpPreferencesEvidence } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY, type KnownCmpDefinition } from "@website-signal-risk-scanner/shared";
import { chromiumContextOptions, chromiumLaunchOptions } from "./playwright-runtime.js";
import { installPublicNetworkGuardRoute } from "./public-network-guard.js";
import { installWebBotAuthRoute } from "./web-bot-auth-routing.js";
import { dispatchLocatorClickWithVerifiedGeometry, locatorHasViewportHitTarget } from "./cmp-control-actionability.js";
import { installBorlabsDeferredDialogReveal, revealBorlabsDeferredDialog } from "./borlabs-passive-dialog-reveal.js";
import { cookieDisclosureColumn } from "@certscore/contracts";

/** A single isolated Options action. No preference changes, save, second click,
 * page retry, policy navigation, model call, or interaction in another lane. */
export async function runCmpPreferencesObserver(input: {
  config: CmpPreferenceDispatch; parentDispatchSha256: string; signal?: AbortSignal;
  browser?: Browser;
}): Promise<CmpPreferencesEvidence> {
  const config = cmpPreferenceDispatchSchema.parse(input.config);
  const started = Date.now();
  const budgetMs = cmpPreferenceBudgetMs(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE === undefined
    ? (process.env.AWS_LAMBDA_FUNCTION_NAME ? NaN : 3008) : Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE));
  const deadline = started + budgetMs;
  const packet: CmpPreferencesEvidence = {
    contractVersion: "certscore.cmp-preferences-evidence.v1", policyVersion: CMP_PREFERENCE_POLICY_VERSION,
    scanId: config.scanId, parentDispatchSha256: input.parentDispatchSha256, targetUrl: config.exactTargetUrl,
    finalUrl: null, documentToken: null, startedAt: new Date(started).toISOString(), completedAt: new Date(started).toISOString(),
    status: "limited", support: { state: "unknown", provider: null, recipeVersion: null, reason: "inspection_incomplete" },
    action: { count: 0, intent: "options", label: null, opened: false }, controls: [], controlInventoryComplete: false,
    privacyLinks: [], declarations: [], declarationInventoryComplete: false, limitations: [],
    inspectionDiagnostic: { revision: "cmp_preferences.v2", budgetMs, phase: "browser_start" },
  };
  let browser = input.browser;
  let context: BrowserContext | undefined;
  let expired = false;
  const cancel = (timedOut: boolean) => { expired = timedOut; void context?.close().catch(() => undefined); if (!input.browser) void browser?.close().catch(() => undefined); };
  const timer = setTimeout(() => cancel(true), budgetMs);
  const abort = () => cancel(false);
  input.signal?.addEventListener("abort", abort, { once: true });
  const remaining = () => {
    if (input.signal?.aborted) throw new Error("preference_inspection_cancelled");
    if (expired || Date.now() >= deadline) throw new Error("preference_budget_exhausted");
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
    page.setDefaultTimeout(300);
    await installBorlabsDeferredDialogReveal(page, config.exactTargetUrl);
    // No redirect or popup can broaden the exact per-scan authorization.
    await context.route("**/*", async route => {
      const request = route.request();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame() && request.url() !== config.exactTargetUrl) await route.abort();
      else await route.fallback();
    });
    packet.inspectionDiagnostic!.phase = "navigation";
    await page.goto(config.exactTargetUrl, { waitUntil: "commit", timeout: remaining() });
    const session = await context.newCDPSession(page);
    const initialFrame = (await session.send("Page.getFrameTree")).frameTree.frame;
    packet.finalUrl = page.url();
    packet.documentToken = initialFrame.loaderId;
    const binding = async () => {
      remaining();
      if (page.url() !== config.exactTargetUrl || (await session.send("Page.getFrameTree")).frameTree.frame.loaderId !== packet.documentToken) throw new Error("preference_document_changed");
    };
    // Loader changes invalidate every checkpoint, including changes during a
    // timed-out click. A closed context alone does not invalidate earlier proof.
    await session.send("Page.enable");
    session.on("Page.frameNavigated", ({ frame }) => {
      if (!frame.parentId && frame.loaderId !== packet.documentToken) {
        packet.checkpoints = undefined; packet.controls = []; packet.privacyLinks = [];
        packet.declarations = []; packet.serviceNames = undefined; packet.declarationInventoryComplete = false;
        packet.controlInventoryComplete = false; packet.action.opened = false;
        packet.documentToken = null; packet.limitations.push("preference_document_changed");
      }
    });
    await binding();
    packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: packet.documentToken!, privacyLinks: false, declarations: false, controls: false, controlsSurface: "first_layer" };
    // Readiness, navigation, inventory and opening share one wall-clock budget.
    // Waiting for the first visible vendor surface avoids racing delayed CMP init.
    const definitions = KNOWN_CMP_REGISTRY.filter(definition => definition.domSelectors?.length);
    packet.inspectionDiagnostic!.phase = "cmp_readiness";
    // Avoid repeated shadow-piercing all-vendor queries while the parser and
    // blocking CMP bootstrap scripts are still initializing. This consumes the
    // same absolute preference deadline, never an additional wait allowance.
    if (!await waitForConsentDocumentReady(page, deadline, input.signal)) {
      remaining();
      throw new Error("preference_budget_exhausted");
    }
    await binding();
    const readySelectors = definitions.flatMap(definition => definition.preferenceInspection
      ? [`${definition.preferenceInspection.entranceSelector} ${definition.preferenceInspection.controlSelector}`]
      : definition.domSelectors!.flatMap(selector => [`${selector} button`, `${selector} [role="button"]`, `${selector} input[type="button"]`]));
    // Playwright's CSS locator traverses open shadow roots (Borlabs v3).
    const readyControl = page.locator(readySelectors.map(selector => `${selector}:visible`).join(",")).first();
    let revealed = false;
    while (!await readyControl.isVisible()) {
      remaining();
      // Reuse the registered passive one-pixel scroll only when Borlabs' own
      // configuration explicitly defers its dialog until visitor interaction.
      if (!revealed) revealed = await revealBorlabsDeferredDialog(page);
      packet.inspectionDiagnostic!.passiveDialogReveal = revealed;
      try { await readyControl.waitFor({ state: "visible", timeout: Math.min(250, remaining()) }); }
      catch (error) { if (!(error instanceof Error) || error.name !== "TimeoutError") throw error; }
    }
    await binding();
    packet.inspectionDiagnostic!.phase = "control_inventory";
    const links = await page.locator("a[href]").evaluateAll(nodes => nodes.slice(0, 300).map(node => {
      const a = node as HTMLAnchorElement, box = a.getBoundingClientRect();
      let hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      for (let depth = 0; hit?.shadowRoot && depth < 8; depth++) {
        const inner = hit.shadowRoot.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        if (!inner || inner === hit) break;
        hit = inner;
      }
      return { url: a.href, label: (a.textContent ?? "").trim().slice(0, 160), hit: box.width > 0 && box.height > 0 && Boolean(hit && (a === hit || a.contains(hit))) };
    }));
    packet.privacyLinks = links.filter(link => link.url.length <= 2000 && /^https?:/.test(link.url) && classifyPrivacySurface({ linkText: link.label, url: link.url }).surfaceType === "privacy_policy")
      .slice(0, 16).map(link => ({ url: link.url, hitTargetBeforeAction: link.hit }));
    await binding();
    packet.checkpoints!.privacyLinks = true;
    const matches: Array<{ provider: string; control: Locator; label: string; scope: Locator; recipe?: KnownCmpDefinition["preferenceInspection"]; dialogBinding?: KnownCmpDefinition["preferenceDialogBinding"] }> = [];
    const detected = new Set<string>();
    // Resolve all registered vendor scopes in one shadow-piercing locator read.
    // Serial full-document selector round trips used most of the remaining
    // budget on busy pages, before we could retain their already-visible CMP.
    const scopeSelectors = definitions.map(definition => definition.preferenceInspection?.entranceSelector ?? definition.domSelectors!.join(","));
    const scopeInventory = await page.locator(scopeSelectors.join(",")).evaluateAll((nodes, selectors) => {
      if (nodes.length > 1000) return { overflow: true, indices: [] as number[], revealed: false };
      return { overflow: false, revealed: (window as unknown as { __certscoreBorlabsPassiveReveal?: boolean }).__certscoreBorlabsPassiveReveal === true, indices: selectors.flatMap((selector, index) => nodes.some(node => node.matches(selector)) ? [index] : []) };
    }, scopeSelectors);
    packet.inspectionDiagnostic!.passiveDialogReveal = revealed || scopeInventory.revealed;
    if (scopeInventory.overflow) { packet.limitations.push("control_inventory_overflow"); return finish(); }
    for (const definitionIndex of scopeInventory.indices) {
      remaining();
      const definition = definitions[definitionIndex]!;
      const recipe = definition.preferenceInspection;
      const scope = page.locator(scopeSelectors[definitionIndex]!);
      detected.add(definition.canonicalName);
      const controls = scope.locator(recipe?.controlSelector ?? 'button, [role="button"], input[type="button"]');
      const inventory = await controls.evaluateAll(nodes => ({ overflow: nodes.length > 100,
        fields: nodes.slice(0, 100).map(element => ({ label: (element.textContent ?? "").trim().slice(0, 240), ariaLabel: element.getAttribute("aria-label"), value: (element as HTMLInputElement).value })) }));
      if (inventory.overflow) { packet.limitations.push("control_inventory_overflow"); continue; }
      for (const [index, fields] of inventory.fields.entries()) {
        const result = classifyConsentControlLabel({ ...fields, hasConsentContext: true, usage: recipe ? "observation" : "action" });
        if (result.intent !== "options" || !result.contextSatisfied || result.matchStrength === "weak") continue;
        const control = controls.nth(index);
        if (await control.isVisible() && await control.isEnabled() && await locatorHasViewportHitTarget(control)) matches.push({ provider: definition.canonicalName, control, label: fields.ariaLabel ?? fields.label, scope, recipe, dialogBinding: definition.preferenceDialogBinding });
      }
    }
    if (matches.length !== 1) {
      packet.support = { state: detected.size ? "partial" : "unknown", provider: detected.size === 1 ? [...detected][0]! : null, recipeVersion: CMP_PREFERENCE_POLICY_VERSION, reason: detected.size ? "unique_actionable_options_not_resolved" : "cmp_not_identified" };
      packet.limitations.push(packet.support.reason);
      return finish();
    }
    const match = matches[0]!;
    packet.support = { state: "partial", provider: match.provider, recipeVersion: match.recipe?.version ?? CMP_PREFERENCE_POLICY_VERSION, reason: "bounded_visible_preference_inspection" };
    const controlledId = await match.control.getAttribute("aria-controls");
    const registeredDialog = !controlledId && match.dialogBinding &&
      await match.control.evaluate((element, selector) => element.matches(selector), match.dialogBinding.controlSelector)
      ? match.dialogBinding : undefined;
    if (registeredDialog) packet.support.recipeVersion = registeredDialog.version;
    const controlled = match.recipe ? page.locator(match.recipe.dialogSelector)
      : registeredDialog ? page.locator(registeredDialog.dialogSelector)
      : controlledId && /^[A-Za-z][\w:-]{0,120}$/.test(controlledId) ? page.locator(`[id="${controlledId}"]`) : null;
    packet.inspectionDiagnostic!.phase = "surface_binding";
    const priorMatches = controlled ? await controlled.count() : 0;
    const surfaceBinding: NonNullable<NonNullable<CmpPreferencesEvidence["inspectionDiagnostic"]>["surfaceBinding"]> = {
      version: "cmp_surface_binding.v1", mode: match.recipe ? "borlabs" : registeredDialog ? "registered_existing" : "aria_controls",
      priorMatches: Math.min(priorMatches, 1000), outcome: "checking",
    };
    packet.inspectionDiagnostic!.surfaceBinding = surfaceBinding;
    const stopBinding = (outcome: typeof surfaceBinding.outcome, reason: string) => {
      surfaceBinding.outcome = outcome; packet.support.reason = reason; packet.limitations.push(reason); return finish();
    };
    if (!controlled || priorMatches > 1 || (match.recipe && await match.scope.count() !== 1)) {
      return stopBinding(priorMatches > 1 ? "ambiguous" : "missing", priorMatches > 1 ? "preference_surface_ambiguous" : "preference_surface_binding_unavailable");
    }
    // A registered OneTrust button may create its panel on opening. Bind that
    // transition to the exact existing vendor root, never to a guessed new modal.
    const deferredRoot = priorMatches === 0 && registeredDialog?.deferredRootSelector
      ? page.locator(registeredDialog.deferredRootSelector) : undefined;
    const deferredRootHandle = deferredRoot && await deferredRoot.count() === 1 ? await deferredRoot.elementHandle() : null;
    if (priorMatches === 0) {
      if (!deferredRootHandle || !await match.control.evaluate((element, root) => Boolean(root?.isConnected && root.contains(element)), deferredRootHandle)) {
        return stopBinding(deferredRoot ? "parent_unbound" : "missing", deferredRoot ? "preference_parent_binding_unavailable" : "preference_surface_missing");
      }
      surfaceBinding.mode = "registered_deferred";
    }
    // Read the already-loaded configuration before the optional panel transition.
    // This moves the API read earlier; no second API read or visit is added.
    const borlabs = match.recipe?.kind === "borlabs_v3" ? await readBorlabsPreferenceInventory(page) : undefined;
    if (borlabs) {
      const raw = await readPreferenceControls(match.scope);
      packet.controls = classifyControls(raw.controls, borlabs);
      await binding();
      packet.declarations = borlabs.declarations;
      packet.serviceNames = borlabs.services.filter(Boolean);
      packet.declarationCoverage = borlabs.coverage;
      packet.declarationInventoryComplete = borlabs.coverage.configured > 0 && !borlabs.coverage.unresolved && !borlabs.coverage.truncated;
      packet.checkpoints!.declarations = true;
      packet.checkpoints!.controls = true;
    }
    const dialogHandle = priorMatches === 1 ? await controlled.elementHandle() : null;
    const beforeVisible = priorMatches === 1 && await controlled.isVisible();
    surfaceBinding.priorVisible = beforeVisible;
    if (!match.recipe && beforeVisible) return stopBinding("already_visible", "preference_surface_already_visible");
    surfaceBinding.outcome = "ready";
    await binding();
    const dispatchFields = await match.control.evaluate((element, expected) => ({ label: (element.textContent ?? "").trim(), ariaLabel: element.getAttribute("aria-label"), value: (element as HTMLInputElement).value, controls: element.getAttribute("aria-controls"),
      registered: !expected.selector || element.matches(expected.selector),
      parentBound: !expected.root || Boolean(expected.root.isConnected && expected.root.contains(element)),
    }), { selector: registeredDialog?.controlSelector, root: deferredRootHandle });
    const dispatchIntent = classifyConsentControlLabel({ ...dispatchFields, hasConsentContext: true, usage: match.recipe ? "observation" : "action" });
    if (dispatchIntent.intent !== "options" || !dispatchIntent.contextSatisfied || dispatchIntent.matchStrength === "weak" || dispatchFields.controls !== controlledId || !dispatchFields.registered || !dispatchFields.parentBound) throw new Error("preference_control_changed");
    packet.inspectionDiagnostic!.phase = "opening";
    await dispatchLocatorClickWithVerifiedGeometry(match.control, Math.min(500, remaining()), () => {
      remaining();
      if (page.url() !== config.exactTargetUrl || packet.action.count !== 0) throw new Error("preference_action_not_authorized");
      packet.action.count = 1; packet.action.label = match.label.slice(0, 160);
    });
    if (match.recipe) {
      // Borlabs replaces the entrance inside the same dialog. No second click,
      // API opening call or arbitrary newly visible modal can establish binding.
      await match.scope.waitFor({ state: "hidden", timeout: remaining() });
      if (!beforeVisible || !dialogHandle || !await controlled.evaluate((element, previous) => element === previous && element.isConnected, dialogHandle)) throw new Error("preference_surface_changed");
    }
    // Waiting on presence does not select a panel for inspection. Recheck exact
    // uniqueness before accepting any opening or reading preference evidence.
    await controlled.first().waitFor({ state: "visible", timeout: remaining() });
    if (await controlled.count() !== 1) throw new Error("preference_surface_ambiguous");
    if (surfaceBinding.mode === "registered_deferred") {
      if (!deferredRoot || !deferredRootHandle || await deferredRoot.count() !== 1 ||
          !await deferredRoot.evaluate((element, previous) => element === previous && element.isConnected, deferredRootHandle) ||
          !await controlled.evaluate((element, root) => Boolean(root?.isConnected && root.contains(element) &&
            ["dialog", "region"].includes(element.getAttribute("role") ?? "") &&
            (element.getAttribute("aria-label")?.trim() || element.getAttribute("aria-labelledby")?.trim())), deferredRootHandle)) throw new Error("preference_surface_changed");
    } else if (!dialogHandle || !await controlled.evaluate((element, previous) => element === previous && element.isConnected, dialogHandle)) throw new Error("preference_surface_changed");
    await binding();
    surfaceBinding.outcome = "opened";
    packet.action.opened = true;
    packet.inspectionDiagnostic!.phase = "preference_inventory";
    const raw = await readPreferenceControls(controlled);
    await binding();
    packet.controls = classifyControls(raw.controls, borlabs);
    packet.checkpoints!.controls = true;
    packet.checkpoints!.controlsSurface = "preferences";
    // Visible toggles establish presence, not completeness of collapsed tabs,
    // lazy service lists, closed shadow roots, or inaccessible frames.
    const incompleteSections = match.recipe ? 1 : await controlled.locator('iframe, [aria-expanded="false"], details:not([open]), [hidden], [role="tab"][aria-selected="false"]').count();
    packet.controlInventoryComplete = !match.recipe && !raw.overflow && incompleteSections === 0 && raw.controls.every(control => control.visible) && packet.controls.every(control => control.kind !== "unclassified");
    if (!packet.controlInventoryComplete) packet.limitations.push(raw.overflow ? "control_inventory_overflow" : match.recipe ? "bounded_vendor_preference_inventory" : "deeper_preference_sections_not_opened");
    const tables = borlabs ? [] : await controlled.locator("table:visible").evaluateAll(nodes => nodes.slice(0, 8).map(table => ({
      headers: [...table.querySelectorAll("thead th")].map(th => (th.textContent ?? "").trim().slice(0, 120)),
      overflow: table.querySelectorAll("tbody tr").length > 100,
      rows: [...table.querySelectorAll("tbody tr")].slice(0, 100).map(row => [...row.querySelectorAll("td")].map(cell => ({ text: (cell.textContent ?? "").trim().slice(0, 240), code: cell.querySelector("code")?.textContent?.trim().slice(0, 160) }))),
    })));
    for (const table of tables) {
      const columns = table.headers.map(cookieDisclosureColumn);
      const nameIndex = columns.indexOf("cookieName"), durationIndex = columns.indexOf("duration"), purposeIndex = columns.indexOf("purpose");
      if (nameIndex < 0) continue;
      for (const row of table.rows) {
        const name = row[nameIndex]?.code ?? row[nameIndex]?.text;
        if (!name || !/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(name)) { packet.limitations.push("unresolved_cookie_inventory_name"); continue; }
        packet.declarations.push({ name, purpose: row[purposeIndex]?.text ?? "", duration: row[durationIndex]?.text ?? "", source: "cmp_visible_inventory" });
      }
      if (table.overflow) packet.limitations.push("cookie_inventory_overflow");
    }

    if (packet.declarations.length > 100) { packet.declarations = packet.declarations.slice(0, 100); packet.declarationInventoryComplete = false; packet.limitations.push("cookie_inventory_overflow"); }
    // A table can be compared as a retained declaration sample. A visible
    // sample is not proof of the CMP's entire dynamic inventory.
    if (!borlabs) packet.declarationInventoryComplete = false;
    await binding();
    packet.checkpoints!.declarations = true;
    packet.status = "completed";
    packet.inspectionDiagnostic!.phase = "completed";
    return finish();
  } catch (error) {
    packet.status = "limited";
    if (!packet.checkpoints?.controls) { packet.controls = []; packet.action.opened = false; }
    packet.controlInventoryComplete = false;
    const timedOut = expired || Date.now() >= deadline || (error instanceof Error && (error.name === "TimeoutError" || error.message === "preference_budget_exhausted"));
    const bindingFailure = error instanceof Error && ["preference_surface_changed", "preference_surface_ambiguous", "preference_document_changed", "preference_control_changed"].includes(error.message) ? error.message : null;
    const reason = timedOut ? "preference_budget_exhausted" : input.signal?.aborted ? "preference_inspection_cancelled" : bindingFailure ?? "preference_inspection_incomplete";
    if (packet.inspectionDiagnostic?.surfaceBinding && !packet.checkpoints?.controls) {
      packet.inspectionDiagnostic.surfaceBinding.outcome = timedOut ? "timed_out" : reason === "preference_surface_ambiguous" ? "ambiguous" : "changed";
    }
    packet.support.reason = reason;
    packet.limitations.push(reason);
    return finish();
  } finally {
    clearTimeout(timer); input.signal?.removeEventListener("abort", abort);
    await context?.close().catch(() => undefined);
    if (!input.browser) await browser?.close().catch(() => undefined);
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
async function readBorlabsPreferenceInventory(page: Page) {
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
    if (!configured || typeof configured !== "object") return { categories, services, declarations, coverage };
    const items = Object.entries(configured);
    coverage.configured = Math.min(items.length, 10000);
    coverage.truncated = items.length > 100;
    for (const [id, item] of items.slice(0, 100)) {
      if (!item || item.id !== id || typeof item.id !== "string" || item.id.length > 160) { coverage.unresolved++; continue; }
      try {
        const service = target.BorlabsCookie?.Services?.findByServiceId?.(item.id);
        if (!service || service.serviceGroupId !== item.serviceGroupId) { coverage.unresolved++; continue; }
        if (typeof service.name === "string") services.push(service.name.trim().slice(0, 240));
        const group = item.serviceGroupId && target.BorlabsCookie?.ServiceGroups?.findByServiceGroupId?.(item.serviceGroupId);
        if (group && typeof group.name === "string") categories.push(group.name.trim().slice(0, 240));
        if (!Array.isArray(service.cookies)) { coverage.unresolved++; continue; }
        coverage.resolved++;
        if (service.cookies.length > 100) coverage.truncated = true;
        for (const cookie of service.cookies.slice(0, 100)) {
          if (declarations.length >= 100) { coverage.truncated = true; break; }
          if (!cookie || typeof cookie.name !== "string" || !/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(cookie.name)) { coverage.unresolved++; continue; }
          declarations.push({ name: cookie.name, purpose: typeof cookie.purpose === "string" ? cookie.purpose.slice(0, 240) : "",
            duration: typeof cookie.lifetime === "string" ? cookie.lifetime.slice(0, 240) : "", source: "cmp_api_inventory" });
        }
      } catch { coverage.unresolved++; }
    }
    return { categories: [...new Set(categories)], services: [...new Set(services)], declarations, coverage };
  });
}

async function readPreferenceControls(controlled: Locator) {
  return await controlled.locator('input[type="checkbox"], [role="switch"], [role="checkbox"]').evaluateAll(nodes => ({
      overflow: nodes.length > 100,
      controls: nodes.slice(0, 100).map(node => {
        const input = node as HTMLInputElement;
        const box = node.getBoundingClientRect();
        const root = node.getRootNode() as Document | ShadowRoot;
        const labelledBy = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean).map(id => root.getElementById(id)?.textContent ?? "").join(" ");
        const label = (node.getAttribute("aria-label") ?? (labelledBy || (input.labels?.length ? [...input.labels].map(label => label.textContent).join(" ") : ""))).trim().slice(0, 240);
        const group = node.closest("fieldset, [role=group]");
        const groupLabel = group?.getAttribute("aria-label") ?? group?.querySelector("legend")?.textContent ?? "";
        return { label, groupLabel: groupLabel.trim().slice(0, 160), visible: box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden", enabled: !input.disabled && node.getAttribute("aria-disabled") !== "true", checked: node instanceof HTMLInputElement ? input.checked : node.getAttribute("aria-checked") === "true" };
      }),
    }));
}

function classifyControls(controls: Awaited<ReturnType<typeof readPreferenceControls>>["controls"], inventory?: Awaited<ReturnType<typeof readBorlabsPreferenceInventory>>) {
  return controls.filter(control => control.visible).map(({ label, groupLabel, enabled, checked }) => ({
    label, enabled, checked,
    kind: inventory?.categories.includes(label) && !inventory.services.includes(label) ? "category" as const
      : inventory?.services.includes(label) && !inventory.categories.includes(label) ? "service" as const
      : classifyConsentPreferenceControl({ label, groupLabel }),
  }));
}
