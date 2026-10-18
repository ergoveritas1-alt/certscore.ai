import axe, { type AxeResults, type Result, type NodeResult } from "axe-core";
import type { Page } from "playwright";
import {
  describeCaptureFailure, type CaptureFailureDiagnostic, ACCESSIBILITY_AUDIT_BUDGET_MS, ACCESSIBILITY_AUDIT_VERSION, ACCESSIBILITY_LIMITS,
  ACCESSIBILITY_MAIN_DOCUMENT_RULE_IDS,
  ACCESSIBILITY_WCAG_TAGS, accessibilityAuditObservationSchema,
  type AccessibilityAuditObservation, type AccessibilityRuleObservation,
} from "@certscore/contracts";

type Identity = NonNullable<AccessibilityRuleObservation["representativeNodes"][number]["imageLinkIdentity"]>;
type IdentifiedNode = NodeResult & { imageLinkIdentity?: Identity; mainDocumentBound?: true };
type CountedRule = Result & { observedNodeCount?: number; mainDocumentNodeCount?: number; mainDocumentNodes?: NodeResult[] };

function safeText(value: string, max: number) {
  return value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/https?:\/\/[^\s"<>]+/gi, url => url.split(/[?#]/)[0] ?? "[redacted]")
    .replace(/\[([^\]=]+)\s*=\s*(["']).*?\2\]/g, "[$1]").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Retain tag/attribute structure, never page text or arbitrary attribute values. */
function safeHtml(html: string) {
  return (html.match(/<[^>]*>/g) ?? []).map(tag => {
    const name = /^<\/?([a-z][a-z0-9-]*)/i.exec(tag)?.[1] ?? "element";
    if (tag.startsWith("</")) return `</${name}>`;
    const attrs = [...tag.matchAll(/\s([a-z][\w:-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi)]
      .map(match => match[1]).filter(name => name && !/^on/i.test(name));
    return `<${name}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
  }).join("").slice(0, 500) || "<element>";
}

export function normalizeAccessibilityRule(rule: CountedRule): AccessibilityRuleObservation {
  return {
    ruleId: rule.id, impact: rule.impact ?? null, tags: rule.tags.slice(0, 24),
    help: safeText(rule.help, 300), description: safeText(rule.description, 600), helpUrl: rule.helpUrl,
    nodeCount: rule.observedNodeCount ?? rule.nodes.length,
    representativeNodes: rule.nodes.slice(0, ACCESSIBILITY_LIMITS.examplesPerRule).map(node => {
      const data = [...node.any, ...node.all, ...node.none].find(check => check.id === "color-contrast")?.data as Record<string, unknown> | undefined;
      const colorContrast: NonNullable<AccessibilityRuleObservation["representativeNodes"][number]["colorContrast"]> = {};
      for (const [from, to] of [["fgColor", "foregroundColor"], ["bgColor", "backgroundColor"], ["fontSize", "fontSize"], ["fontWeight", "fontWeight"]] as const) {
        const value = data?.[from];
        if (typeof value === "string" && /^[#\w.,()%\s-]{1,40}$/.test(value)) colorContrast[to] = value;
      }
      if (typeof data?.contrastRatio === "number" && Number.isFinite(data.contrastRatio)) colorContrast.contrastRatio = data.contrastRatio;
      const expected = Number.parseFloat(String(data?.expectedContrastRatio ?? ""));
      if (Number.isFinite(expected)) colorContrast.requiredContrastRatio = expected;
      return {
        ...((node as IdentifiedNode).mainDocumentBound ? { mainDocumentBound: true as const } : {}),
        ...((node as IdentifiedNode).imageLinkIdentity ? { imageLinkIdentity: (node as IdentifiedNode).imageLinkIdentity } : {}),
        selectors: node.target.slice(0, ACCESSIBILITY_LIMITS.selectorsPerNode).map(target => Array.isArray(target)
          ? target.slice(0, 8).map(value => safeText(value, 400)) : safeText(target, 400)),
        htmlSnippet: safeHtml(node.html),
        failureSummary: safeText(node.failureSummary ?? node.any[0]?.message ?? rule.help, 800),
        ...(Object.keys(colorContrast).length ? { colorContrast } : {}),
      };
    }),
  };
}

/** Preserve rule coverage/counts first. Extra repeated element examples yield
 * fairly across rules only when the existing byte ceiling is reached. */
export function retainAccessibilityExampleBreadth<T extends {
  violations: AccessibilityRuleObservation[]; reviewItems: AccessibilityRuleObservation[];
}>(observation: T, byteLimit: number = ACCESSIBILITY_LIMITS.evidenceBytes): T & {
  exampleCoverage: NonNullable<AccessibilityAuditObservation["exampleCoverage"]>;
} | null {
  const source = [...observation.violations, ...observation.reviewItems];
  const fullCoverage = { version: "breadth_before_detail.v1" as const,
    observedNodeCount: source.reduce((total, rule) => total + rule.nodeCount, 0),
    retainedNodeCount: source.reduce((total, rule) => total + rule.representativeNodes.length, 0),
    omittedNodeCount: 0, byteBudgetLimited: false };
  fullCoverage.omittedNodeCount = fullCoverage.observedNodeCount - fullCoverage.retainedNodeCount;
  const full = { ...observation, exampleCoverage: fullCoverage };
  if (Buffer.byteLength(JSON.stringify(full), "utf8") <= byteLimit) return full;
  const pinned = new Set(["image-alt", "link-name", "meta-viewport", "target-size"]);
  const retained = source.map(rule => ({ ...rule,
    representativeNodes: rule.representativeNodes.slice(0, pinned.has(rule.ruleId) ? ACCESSIBILITY_LIMITS.examplesPerRule : 1) }));
  const result = { ...observation,
    violations: retained.slice(0, observation.violations.length), reviewItems: retained.slice(observation.violations.length),
    exampleCoverage: { ...fullCoverage, byteBudgetLimited: true },
  };
  const measure = () => {
    result.exampleCoverage.retainedNodeCount = retained.reduce((total, rule) => total + rule.representativeNodes.length, 0);
    result.exampleCoverage.omittedNodeCount = result.exampleCoverage.observedNodeCount - result.exampleCoverage.retainedNodeCount;
    return Buffer.byteLength(JSON.stringify(result), "utf8");
  };
  let usedBytes = measure();
  if (usedBytes > byteLimit) return null; // Never fabricate a rule without usable proof.
  // Reserve a few bytes for changing count digits, rather than serializing the
  // entire observation for every example. This bounds allocation CPU as well.
  usedBytes += 16;
  const impact = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const order = source.map((rule, index) => ({ rule, index })).sort((a, b) =>
    (impact[a.rule.impact ?? "minor"] - impact[b.rule.impact ?? "minor"]) || a.rule.ruleId.localeCompare(b.rule.ruleId) || a.index - b.index);
  for (let round = 1; round < ACCESSIBILITY_LIMITS.examplesPerRule; round++) {
    for (const { rule, index } of order) {
      const target = retained[index]!;
      if (target.representativeNodes.length > round || !rule.representativeNodes[round]) continue;
      const node = rule.representativeNodes[round]!;
      const addedBytes = Buffer.byteLength(JSON.stringify(node), "utf8") + 1;
      if (usedBytes + addedBytes <= byteLimit) {
        target.representativeNodes.push(node);
        usedBytes += addedBytes;
      }
    }
  }
  return measure() <= byteLimit ? result : null;
}

export function unavailableAccessibilityAudit(input: {
  scanId: string; documentUrl: string; documentToken?: string | null;
  diagnostic?: CaptureFailureDiagnostic; reason: string; status?: "limited" | "failed" | "not_testable"; startedAtMs?: number;
}): AccessibilityAuditObservation {
  const end = Date.now();
  return accessibilityAuditObservationSchema.parse({
    contractVersion: ACCESSIBILITY_AUDIT_VERSION, required: true, scanId: input.scanId,
    sourceLane: "runtime_evidence", scope: "starting_page_rendered_content", documentUrl: input.documentUrl,
    documentToken: input.documentToken ?? null, engine: "axe-core", engineVersion: axe.version,
    configuredTags: [...ACCESSIBILITY_WCAG_TAGS], status: input.status ?? "not_testable",
    startedAt: new Date(input.startedAtMs ?? end).toISOString(), completedAt: new Date(end).toISOString(),
    durationMs: Math.min(ACCESSIBILITY_AUDIT_BUDGET_MS + 2000, end - (input.startedAtMs ?? end)),
    rulesEvaluated: [], violations: [], reviewItems: [], limitations: [input.reason],
    ...(input.diagnostic ? { executionDiagnostic: input.diagnostic } : {}),
  });
}

/** Called only after every baseline observer is frozen. No navigation, interaction, model, or CDN. */
export async function runAccessibilityAudit(input: {
  page: Page; scanId: string; documentIdentity: () => { token?: string } | undefined;
  signal?: AbortSignal; budgetMs?: number;
}): Promise<AccessibilityAuditObservation> {
  const startedAtMs = Date.now(), documentUrl = input.page.url(), documentToken = input.documentIdentity()?.token;
  const unavailable = (reason: string, status: "limited" | "failed" | "not_testable" = "limited") => unavailableAccessibilityAudit({
    scanId: input.scanId, documentUrl: /^https?:\/\//.test(documentUrl) ? documentUrl : "https://unavailable.invalid/",
    documentToken, reason, status, startedAtMs,
  });
  if (!documentToken || !/^https?:\/\//.test(documentUrl) || input.page.isClosed()) return unavailable("document_unavailable", "not_testable");
  if (input.signal?.aborted) return unavailable("cancelled");
  const budget = Math.max(1, Math.min(input.budgetMs ?? ACCESSIBILITY_AUDIT_BUDGET_MS, ACCESSIBILITY_AUDIT_BUDGET_MS));
  let timer: ReturnType<typeof setTimeout> | undefined, onAbort: (() => void) | undefined;
  let stopped = false;
  let phase = "engine_injection";
  const work = async () => {
    const frames = input.page.frames(), frameUrls = frames.map(frame => frame.url()), limitations: string[] = [];
    let mainNavigated = false;
    let unavailableChildFrameCount = Math.max(0, frames.length - 16);
    const changedFrames = new Set<import("playwright").Frame>();
    const onNavigation = (frame: import("playwright").Frame) => { if (frame === input.page.mainFrame()) mainNavigated = true; else changedFrames.add(frame); };
    input.page.on("framenavigated", onNavigation);
    try {
    if (frames.length > 16) limitations.push("frame_limit");
    for (const frame of frames.slice(0, 16)) {
      if (stopped || input.signal?.aborted) throw new Error("cancelled");
      try { await frame.evaluate(axe.source + "\n;void 0;"); }
      catch { if (frame === input.page.mainFrame()) throw new Error("engine_injection_failed"); unavailableChildFrameCount++; limitations.push("frame_unavailable"); }
    }
    if (stopped) throw new Error("cancelled");
    phase = "engine_execution";
    const results = await input.page.evaluate(async ({ tags, exampleLimit, mainRules, mainDocumentOnly }): Promise<AxeResults> => {
      const engine = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<AxeResults> } }).axe;
      // Axe otherwise waits up to 60s for a child frame, beyond this entire 8s
      // audit. Bound that existing wait so main-document results can complete;
      // unresponsive child checks remain incomplete rather than clean.
      const results = await engine.run(document, { runOnly: { type: "tag", values: tags }, rules: { "frame-tested": { enabled: true } }, resultTypes: ["violations", "incomplete"], preload: false, elementRef: true, iframes: !mainDocumentOnly, frameWaitTime: 750 });
      const identities = new WeakMap<Element, number>();
      let nextId = 0;
      const frameElements = [...document.querySelectorAll("iframe,frame")].slice(0, 257);
      for (const rule of [...results.violations, ...results.incomplete]) {
        (rule as CountedRule).observedNodeCount = rule.nodes.length;
        const mainNodes = mainRules.includes(rule.id) && frameElements.length <= 256 ? rule.nodes.filter(node => {
          const element = node.element;
          if (!element?.isConnected || element.ownerDocument !== document || element.getRootNode() !== document ||
              element === document.body || element === document.documentElement || element.shadowRoot ||
              frameElements.some(frame => frame === element || element.contains(frame))) return false;
          if ([...node.any, ...node.all, ...node.none].some(check => check.relatedNodes?.some(related =>
            related.element && related.element.ownerDocument !== document))) return false;
          (node as IdentifiedNode).mainDocumentBound = true;
          return true;
        }) : [];
        (rule as CountedRule).mainDocumentNodeCount = mainNodes.length;
        if (mainNodes.length && mainNodes.length !== rule.nodes.length) (rule as CountedRule).mainDocumentNodes = mainNodes.slice(0, exampleLimit);
        rule.nodes = rule.nodes.slice(0, exampleLimit);
        const captureIdentity = results.violations.includes(rule) && ["image-alt", "link-name"].includes(rule.id);
        for (const node of new Set([...rule.nodes, ...((rule as CountedRule).mainDocumentNodes ?? [])])) {
          const element = node.element;
          if (captureIdentity && element?.isConnected && element.ownerDocument === document) {
            const link = element.localName === "a" ? element : element.localName === "img" ? element.parentElement : null;
            const imageOnly = link?.localName === "a" && link.children.length === 1 && link.firstElementChild?.localName === "img" &&
              Array.from(link.childNodes).every(child => child === link.firstElementChild || child.nodeType === Node.TEXT_NODE && !child.textContent?.trim());
            for (const target of imageOnly ? [element, link!] : [element]) {
              if (!identities.has(target)) identities.set(target, ++nextId);
            }
            (node as IdentifiedNode).imageLinkIdentity = { contractVersion: "certscore.accessibility-image-link-identity.v1",
              nodeId: identities.get(element)!, imageOnlyLinkId: imageOnly ? identities.get(link!)! : null };
          }
          delete node.element;
          // Related elements and arbitrary rule data are not used by the typed
          // observation. Do not transfer thousands of unused DOM excerpts.
          for (const check of [...node.any, ...node.all, ...node.none]) {
            check.relatedNodes = [];
            if (check.id !== "color-contrast") delete check.data;
            else if (check.data && typeof check.data === "object") {
              const data = check.data as Record<string, unknown>;
              check.data = Object.fromEntries(["fgColor", "bgColor", "fontSize", "fontWeight", "contrastRatio", "expectedContrastRatio"]
                .filter(key => typeof data[key] === "string" || typeof data[key] === "number").map(key => [key, data[key]]));
            }
          }
        }
      }
      // These groups contribute evaluated rule IDs, never element examples.
      for (const rule of [...results.passes, ...results.inapplicable]) rule.nodes = [];
      return results;
    }, { tags: [...ACCESSIBILITY_WCAG_TAGS], exampleLimit: ACCESSIBILITY_LIMITS.examplesPerRule, mainRules: [...ACCESSIBILITY_MAIN_DOCUMENT_RULE_IDS] as string[], mainDocumentOnly: unavailableChildFrameCount > 0 });
    phase = "result_normalization";
    if (results.testEngine.name !== "axe-core" || results.testEngine.version !== axe.version) return unavailable("engine_identity_mismatch");
    if (mainNavigated || input.page.url() !== documentUrl || input.documentIdentity()?.token !== documentToken) return unavailable("document_changed");
    const afterFrames = input.page.frames();
    const childFramesChanged = changedFrames.size > 0 || frames.length !== afterFrames.length || frames.some((frame, i) => frame !== afterFrames[i] || frame.url() !== frameUrls[i]);
    const engineRuleCount = new Set([...results.violations, ...results.incomplete, ...results.passes, ...results.inapplicable].map(rule => rule.id)).size;
    let frameCoverage: AccessibilityAuditObservation["frameCoverage"];
    if (childFramesChanged || unavailableChildFrameCount > 0) {
      const originalNodeCount = [...results.violations, ...results.incomplete].reduce((sum, rule) => sum + ((rule as CountedRule).observedNodeCount ?? rule.nodes.length), 0);
      const retainMain = (rules: Result[]) => rules.flatMap(rule => {
        const count = (rule as CountedRule).mainDocumentNodeCount ?? 0;
        const nodes = ((rule as CountedRule).mainDocumentNodes ?? rule.nodes).filter(node => (node as IdentifiedNode).mainDocumentBound === true);
        return count > 0 && nodes.length ? [{ ...rule, observedNodeCount: count, nodes }] : [];
      });
      results.violations = retainMain(results.violations); results.incomplete = retainMain(results.incomplete);
      if (!results.violations.length && !results.incomplete.length) return unavailable(unavailableChildFrameCount > 0 ? "frames_unavailable" : "frames_changed");
      frameCoverage = { version: "stable_main_document_evidence.v1", resultScope: "positive_findings_only", documentToken, engineRunCount: 1,
        engineRuleCount, changedChildFrameCount: childFramesChanged ? Math.min(10000, Math.max(1, changedFrames.size, Math.abs(frames.length - afterFrames.length))) : 0,
        ...(unavailableChildFrameCount ? { unavailableChildFrameCount: Math.min(10000, unavailableChildFrameCount) } : {}),
        excludedNodeCount: originalNodeCount - [...results.violations, ...results.incomplete].reduce((sum, rule) => sum + (rule as CountedRule).observedNodeCount!, 0) };
      limitations.push(unavailableChildFrameCount ? "unavailable_frames_main_document_retained" : "child_frames_changed_main_document_retained");
    }
    if (results.violations.length > ACCESSIBILITY_LIMITS.rules || results.incomplete.length > ACCESSIBILITY_LIMITS.rules) limitations.push("rule_limit");
    if (results.incomplete.length) limitations.push("rules_need_review");
    const rulesEvaluated = [...new Set([...results.violations, ...results.incomplete, ...(frameCoverage ? [] : [...results.passes, ...results.inapplicable])].map(rule => rule.id))];
    if (rulesEvaluated.length > ACCESSIBILITY_LIMITS.rules) return unavailable("rule_limit");
    const observation = {
      contractVersion: ACCESSIBILITY_AUDIT_VERSION, required: true, scanId: input.scanId, sourceLane: "runtime_evidence",
      scope: "starting_page_rendered_content", documentUrl, documentToken, engine: "axe-core", engineVersion: results.testEngine.version,
      configuredTags: [...ACCESSIBILITY_WCAG_TAGS], status: limitations.length ? "limited" : "completed",
      startedAt: new Date(startedAtMs).toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - startedAtMs,
      rulesEvaluated, violations: results.violations.slice(0, ACCESSIBILITY_LIMITS.rules).map(normalizeAccessibilityRule),
      reviewItems: results.incomplete.slice(0, ACCESSIBILITY_LIMITS.rules).map(normalizeAccessibilityRule), limitations: [...new Set(limitations)].slice(0, 16), ...(frameCoverage ? { frameCoverage } : {}),
    };
    // An optional, one-menu probe runs only after the baseline audit and every
    // privacy observer have frozen. It shares the existing eight-second cap.
    // This is neither a consent action nor a whole-site keyboard assessment.
    const menuMemoryMb = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? (process.env.AWS_LAMBDA_FUNCTION_NAME ? "NaN" : "3008"));
    const menu = process.env.CERTSCORE_ACCESSIBILITY_MENU_INSPECTION_ENABLED === "1" &&
      Number.isFinite(menuMemoryMb) && menuMemoryMb >= 512 && menuMemoryMb <= 4096 &&
      Date.now() - startedAtMs + 1000 < budget
      ? await inspectOneNavigationMenu(input.page, documentToken, () => input.documentIdentity()?.token === documentToken, normalizeAccessibilityRule)
      : null;
    if (menu) {
      for (const rule of menu.violations) {
        const existing = observation.violations.find(row => row.ruleId === rule.ruleId);
        if (existing) {
          existing.nodeCount += rule.nodeCount;
          // Keep examples from both visible states within the original limit.
          existing.representativeNodes = [...existing.representativeNodes.slice(0, 2), ...rule.representativeNodes.slice(0, 3)].slice(0, ACCESSIBILITY_LIMITS.examplesPerRule);
        } else observation.violations.push(rule);
        if (!observation.rulesEvaluated.includes(rule.ruleId)) observation.rulesEvaluated.push(rule.ruleId);
      }
    }
    observation.completedAt = new Date().toISOString();
    observation.durationMs = Date.now() - startedAtMs;
    const withMenu = menu ? { ...observation, menuInspection: menu.inspection } : observation;
    const retained = retainAccessibilityExampleBreadth(withMenu);
    if (!retained) return unavailable("evidence_size_limit");
    phase = "contract_validation";
    return accessibilityAuditObservationSchema.parse(retained);
    } finally { input.page.off("framenavigated", onNavigation); }
  };
  try {
    return await Promise.race([
      work(),
      new Promise<AccessibilityAuditObservation>(resolve => {
        const stop = (reason: string) => {
          // Stop evaluation too: a Promise.race alone would leave axe running after publication.
          stopped = true;
          void input.page.close({ runBeforeUnload: false }).catch(() => undefined);
          resolve(unavailable(reason));
        };
        timer = setTimeout(() => stop("audit_timeout"), budget);
        onAbort = () => stop("cancelled");
        input.signal?.addEventListener("abort", onAbort, { once: true });
        if (input.signal?.aborted) onAbort();
      }),
    ]);
  } catch (error) {
    if (process.env.CERTSCORE_LOCAL_CAPTURE_DIAGNOSTICS === "1" && process.env.NODE_ENV !== "production" && !process.env.AWS_LAMBDA_FUNCTION_NAME) console.error("LOCAL_CAPTURE_FAILURE", JSON.stringify({ scope: "accessibility", phase, message: safeText(error instanceof Error ? error.message : "Unknown failure", 350) }));
    return { ...unavailable("audit_execution_failed", "failed"), executionDiagnostic: describeCaptureFailure(error, phase) }; }
  finally {
    if (timer) clearTimeout(timer);
    if (onAbort) input.signal?.removeEventListener("abort", onAbort);
  }
}

/** One semantic navigation popup, never a link, form, privacy choice or Save.
 * The optional work has its own 800 ms ceiling and cannot invalidate already
 * verified baseline results when the popup cannot be inspected. */
async function inspectOneNavigationMenu(
  page: Page, documentToken: string, bound: () => boolean,
  normalize: (rule: CountedRule) => AccessibilityRuleObservation,
): Promise<{ inspection: NonNullable<AccessibilityAuditObservation["menuInspection"]>; violations: AccessibilityRuleObservation[] } | null> {
  const url = page.url(), deadline = Date.now() + 800;
  const guard = async (route: import("playwright").Route) => {
    const request = route.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) await route.abort();
    else await route.fallback();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([ (async () => {
      await page.route("**/*", guard);
      const selector = ':is(header, nav, [role="navigation"]) :is([aria-haspopup="menu"], [aria-haspopup="dialog"])[aria-expanded="false"]:not(a):not(input):not(select):not([form])';
      const candidates = page.locator(`${selector}:visible`);
      if (!await candidates.count()) return null;
      const trigger = await candidates.first().elementHandle();
      if (!trigger) return null;
      const prepared = await trigger.evaluate(element => {
        if (element.closest('form, [role="dialog"], [role="alertdialog"]') || !element.isConnected) return null;
        const box = element.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (box.width <= 0 || box.height <= 0 || !hit || !(hit === element || element.contains(hit))) return null;
        const elements = [...document.querySelectorAll('a,button,[role="button"]')];
        if (elements.length > 1000) return null;
        const visible = elements.filter(node => {
          let current: Element | null = node;
          for (let depth = 0; current && depth < 32; depth++, current = current.parentElement) {
            const style = getComputedStyle(current);
            if (style.display === "none" || style.visibility !== "visible" || style.opacity === "0" || current.matches('[hidden],[inert],[aria-hidden="true"]')) return false;
          }
          return !current && node.getClientRects().length > 0;
        });
        // Ephemeral element identity stays in this page, never in evidence.
        const root = element.closest('nav,[role="navigation"]') ?? element.closest('header,[role="banner"]');
        if (!root) return null;
        (window as unknown as { __certscoreMenuBefore?: {visible: Set<Element>; root: Element; trigger: Element; controlledId: string | null} }).__certscoreMenuBefore =
          {visible: new Set(visible), root, trigger: element, controlledId: element.getAttribute("aria-controls")};
        const path:string[]=[];
        let current:Element|null=element;
        for(let depth=0;current&&depth<12;depth++,current=current.parentElement){
          if(current.id){path.unshift(`#${CSS.escape(current.id)}`);break;}
          const siblings=current.parentElement?Array.from(current.parentElement.children).filter(node=>node.localName===current!.localName):[];
          path.unshift(`${current.localName}${siblings.length>1?`:nth-of-type(${siblings.indexOf(current)+1})`:''}`);
        }
        const exactSelector=path.join(' > ');
        if(exactSelector.length>400||document.querySelectorAll(exactSelector).length!==1||document.querySelector(exactSelector)!==element)return null;
        const labelledBy=(element.getAttribute('aria-labelledby')??'').split(/\s+/).map(id=>document.getElementById(id)?.textContent??'').join(' ').trim();
        return { selector:exactSelector, name:element.getAttribute('aria-label')||labelledBy||element.textContent||'',keyboardFocusable: (element as HTMLElement).tabIndex >= 0 };
      });
      if (!prepared || !bound() || page.url() !== url || Date.now() >= deadline) return null;
      await trigger.click({ timeout: Math.max(1, Math.min(250, deadline - Date.now())), noWaitAfter: true });
      if (!bound() || page.url() !== url || await trigger.getAttribute("aria-expanded") !== "true") return null;
      const rows = await page.evaluate(async (): Promise<Result[]> => {
        const engine = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<AxeResults> } }).axe;
        const before = (window as unknown as { __certscoreMenuBefore?: {visible: Set<Element>; root: Element; trigger: Element; controlledId: string | null} }).__certscoreMenuBefore;
        if (!before?.root.isConnected || !before.trigger.isConnected || !before.root.contains(before.trigger) || before.trigger.getAttribute("aria-expanded") !== "true") return [];
        const panels = before.controlledId ? document.querySelectorAll(`#${CSS.escape(before.controlledId)}`) : null;
        if (panels && panels.length !== 1) return [];
        const scope = panels?.[0] ?? before.root;
        const result = await engine.run(document, { runOnly: { type: "rule", values: ["link-name", "button-name"] }, resultTypes: ["violations"], preload: false, elementRef: true });
        return result.violations.flatMap(rule => {
          const nodes = rule.nodes.filter(node => node.element?.ownerDocument === document && node.element.isConnected && scope.contains(node.element) && !before.visible.has(node.element));
          if (!nodes.length) return [];
          for (const node of nodes) {
            (node as IdentifiedNode).mainDocumentBound = true;
            delete node.element;
            for (const check of [...node.any, ...node.all, ...node.none]) { check.relatedNodes = []; delete check.data; }
          }
          return [{ ...rule, observedNodeCount: nodes.length, nodes: nodes.slice(0, 5) }];
        });
      });
      if (!bound() || page.url() !== url || Date.now() >= deadline) return null;
      return { inspection: { version: "bounded_navigation_menu.v1" as const, documentToken,
        triggerSelector: prepared.selector, triggerAccessibleName:safeText(prepared.name,160),capturePolicyVersion:"menu_identity.v2" as const,triggerKeyboardFocusable: prepared.keyboardFocusable,
        expanded: true as const, engineRunCount: 1 as const, rulesEvaluated: ["link-name", "button-name"] as ["link-name", "button-name"] },
        violations: rows.map(rule => { const row = normalize(rule); row.representativeNodes.forEach(node => { node.captureState = "opened_navigation_menu"; }); return row; }) };
    })(), new Promise<null>(resolve => { timer = setTimeout(() => {
      // Terminate browser work as well as the promise; no post-publication probe.
      void page.close({ runBeforeUnload: false }).catch(() => undefined); resolve(null);
    }, 800); }) ]);
  } catch { return null; }
  finally { if (timer) clearTimeout(timer); await page.unroute("**/*", guard).catch(() => undefined); }
}
