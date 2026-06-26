import * as classifierExports from "../packages/certscore-contracts/src/consent-control-label-classifier";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Frame, type Page } from "playwright";

const classifierModule = ("default" in classifierExports && classifierExports.default)
  ? classifierExports.default as typeof classifierExports
  : classifierExports;
const { classifyConsentControlLabel } = classifierModule;

type CandidateLane = "dom" | "accessibility";
type PrototypeIntent = "accept" | "reject" | "options" | "privacy_opt_out" | "unknown";

type Candidate = {
  id: string;
  lane: CandidateLane;
  label: string;
  role?: string;
  tagName?: string;
  selectorHint?: string;
  visible: boolean;
  bbox?: { x: number; y: number; width: number; height: number };
  surface: {
    consentContext: boolean;
    fixedOrSticky: boolean;
    dialogLike: boolean;
    footerOrNav: boolean;
    viewportIntersecting: boolean;
    highZIndex: boolean;
    contextText: string;
  };
  canonical: ReturnType<typeof classifyConsentControlLabel>;
  prototypeIntent: PrototypeIntent;
  retained: boolean;
  retentionReasons: string[];
};

type SiteResult = {
  url: string;
  finalUrl?: string;
  status: "completed" | "failed";
  durationMs: number;
  screenshotPath?: string;
  domTextPath?: string;
  acceptObserved: boolean;
  rejectObserved: boolean;
  optionsObserved: boolean;
  retainedLabels: string[];
  candidates: Candidate[];
  error?: string;
};

const DEFAULT_URLS = [
  "https://certscore.ai/",
  "https://ikea.com/",
  "https://numastays.com/",
  "https://skalar.de/",
  "https://google.com/",
  "https://gatech.edu/",
];

async function main() {
  const urls = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const targets = urls.length > 0 ? urls : DEFAULT_URLS;
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const outDir = path.resolve("artifacts", "consent-control-calibration", timestamp);
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/New_York",
    viewport: { width: 1366, height: 900 },
  });

  const results: SiteResult[] = [];
  for (const url of targets) {
    const siteDir = path.join(outDir, slugForUrl(url));
    await mkdir(siteDir, { recursive: true });
    const result = await runSite(context, url, siteDir).catch((error): SiteResult => ({
      url,
      status: "failed",
      durationMs: 0,
      acceptObserved: false,
      rejectObserved: false,
      optionsObserved: false,
      retainedLabels: [],
      candidates: [],
      error: error instanceof Error ? error.message : String(error),
    }));
    results.push(result);
    console.log(`${result.status}: ${url} accept=${result.acceptObserved} reject=${result.rejectObserved} options=${result.optionsObserved}`);
  }

  await browser.close();

  const report = {
    reportVersion: "certscore.consent_control_calibration.1",
    generatedAt: new Date().toISOString(),
    outputDir: outDir,
    results,
  };
  await writeFile(path.join(outDir, "ConsentControlCalibration.report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(outDir, "ConsentControlCalibration.report.md"), markdownFor(results, outDir));
  console.log(`Wrote ${path.join(outDir, "ConsentControlCalibration.report.md")}`);
}

async function runSite(context: BrowserContext, url: string, siteDir: string): Promise<SiteResult> {
  const startedAt = Date.now();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_500);
    const domHintText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
    if (hasConsentHint(domHintText)) {
      await page.waitForTimeout(2_500);
    }

    const screenshotPath = path.join(siteDir, "viewport.png");
    const domTextPath = path.join(siteDir, "dom-text.txt");
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
    const domText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
    await writeFile(domTextPath, domText);

    const [domCandidates, axCandidates] = await Promise.all([
      collectDomCandidates(page),
      collectAccessibilityCandidates(page),
    ]);
    const candidates = mergeCandidates([...domCandidates, ...axCandidates])
      .map((candidate, index) => enrichCandidate(candidate, index));
    const retained = candidates.filter((candidate) => candidate.retained);

    return {
      url,
      finalUrl: page.url(),
      status: "completed",
      durationMs: Date.now() - startedAt,
      screenshotPath,
      domTextPath,
      acceptObserved: retained.some((candidate) => candidate.prototypeIntent === "accept"),
      rejectObserved: retained.some((candidate) => candidate.prototypeIntent === "reject"),
      optionsObserved: retained.some((candidate) => candidate.prototypeIntent === "options"),
      retainedLabels: retained.map((candidate) => candidate.label),
      candidates,
    };
  } catch (error) {
    return {
      url,
      finalUrl: page.url(),
      status: "failed",
      durationMs: Date.now() - startedAt,
      acceptObserved: false,
      rejectObserved: false,
      optionsObserved: false,
      retainedLabels: [],
      candidates: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function collectDomCandidates(page: Page): Promise<Omit<Candidate, "id" | "canonical" | "prototypeIntent" | "retained" | "retentionReasons">[]> {
  const mainCandidates = await page.evaluate(String.raw`(() => {
    const interactiveSelector = [
      "button",
      "a",
      "input[type='button']",
      "input[type='submit']",
      "input[type='reset']",
      "[role='button']",
      "[role='link']",
      "[role='menuitem']",
      "[tabindex]",
      "[onclick]",
      "[id*='button' i]",
      "[id*='btn' i]",
      "[id*='choice' i]",
      "[id*='option' i]",
      "[id*='preference' i]",
      "[class*='button' i]",
      "[class*='btn' i]",
      "[class*='choice' i]",
      "[class*='option' i]",
      "[class*='preference' i]",
    ].join(",");
    const consentPattern = /cookie|cookies|consent|privacy|tracking|analytics|advertising|marketing|preferences?|settings|choices?|onetrust|optanon|cmp|trustarc|didomi|usercentrics|cookiebot|datenschutz|einwilligung|confidentialit/i;

    const roots = [document];
    const seenRoots = new Set(roots);
    const visitRoot = (root) => {
      for (const element of Array.from(root.querySelectorAll("*")).slice(0, 2_000)) {
        const shadowRoot = element.shadowRoot;
        if (shadowRoot && !seenRoots.has(shadowRoot)) {
          seenRoots.add(shadowRoot);
          roots.push(shadowRoot);
          visitRoot(shadowRoot);
        }
      }
    };
    visitRoot(document);
    for (const iframe of Array.from(document.querySelectorAll("iframe")).slice(0, 8)) {
      try {
        const frameDocument = iframe.contentDocument;
        if (frameDocument?.body && !seenRoots.has(frameDocument)) {
          seenRoots.add(frameDocument);
          roots.push(frameDocument);
          visitRoot(frameDocument);
        }
      } catch {
      }
    }

    const candidates = [];
    const elements = [];
    for (const root of roots) {
      elements.push(...Array.from(root.querySelectorAll(interactiveSelector)).slice(0, 800));
    }
    for (const element of elements.slice(0, 1_200)) {
      const style = window.getComputedStyle(element);
      const pointerLike = style.cursor === "pointer";
      const nativeInteractive = /^(?:button|a|input|select)$/i.test(element.tagName);
      const role = element.getAttribute("role") || undefined;
      if (!nativeInteractive && !role && !pointerLike && !element.hasAttribute("onclick") && element.getAttribute("tabindex") === null) {
        continue;
      }
      const label = labelFor(element);
      if (!label || label.length > 160) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getAttribute("aria-hidden") !== "true" &&
        Number.parseFloat(style.opacity || "1") > 0.05;
      const surface = surfaceFor(element, consentPattern);
      candidates.push({
        lane: "dom",
        label,
        role,
        tagName: element.tagName.toLowerCase(),
        selectorHint: selectorHintFor(element),
        visible,
        bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        surface,
      });
    }
      return candidates;

    function labelFor(element) {
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledByText = labelledBy?.split(/\s+/)
        .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
        .join(" ");
      const input = element instanceof HTMLInputElement ? element.value || element.placeholder : "";
      const imageAlt = element.querySelector?.("img[alt]")?.getAttribute("alt");
      return [
        element.getAttribute("aria-label"),
        labelledByText,
        element.getAttribute("title"),
        element.getAttribute("alt"),
        input,
        element.textContent,
        imageAlt,
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    }

    function selectorHintFor(element) {
      const id = element.getAttribute("id");
      const testId = element.getAttribute("data-testid");
      const className = element.getAttribute("class")?.split(/\s+/).filter(Boolean).slice(0, 3).join(".");
      if (id) return "#" + id;
      if (testId) return "[data-testid=\"" + testId + "\"]";
      if (className) return element.tagName.toLowerCase() + "." + className;
      return element.tagName.toLowerCase();
    }

    function surfaceFor(element, pattern) {
      let current = element;
      let contextText = "";
      let fixedOrSticky = false;
      let dialogLike = false;
      let footerOrNav = false;
      let highZIndex = false;
      for (let depth = 0; current && depth < 10; depth += 1) {
        const currentStyle = window.getComputedStyle(current);
        const role = (current.getAttribute("role") || "").toLowerCase();
        const idClassRole = [
          current.tagName,
          current.getAttribute("id"),
          current.getAttribute("class"),
          role,
        ].filter(Boolean).join(" ");
        const text = (current.textContent || "").replace(/\s+/g, " ").trim();
        if (!contextText || (pattern.test(text + " " + idClassRole) && text.length < 3_000)) {
          contextText = text.slice(0, 1_000);
        }
        fixedOrSticky ||= currentStyle.position === "fixed" || currentStyle.position === "sticky";
        dialogLike ||= role === "dialog" || role === "alertdialog" || role === "banner" || current.getAttribute("aria-modal") === "true";
        footerOrNav ||= /^(?:footer|header|nav|aside)$/i.test(current.tagName) || /footer|header|nav|menu|breadcrumb/i.test(idClassRole);
        const zIndex = Number.parseInt(currentStyle.zIndex || "0", 10);
        highZIndex ||= Number.isFinite(zIndex) && zIndex >= 10;
        const root = current.getRootNode?.();
        current = current.parentElement || root?.host || null;
      }
      const rect = element.getBoundingClientRect();
      return {
        consentContext: pattern.test(contextText),
        fixedOrSticky,
        dialogLike,
        footerOrNav,
        viewportIntersecting: rect.bottom >= -20 && rect.top <= window.innerHeight + 20 && rect.right >= -20 && rect.left <= window.innerWidth + 20,
        highZIndex,
        contextText,
      };
    }
  })()`);
  const frameCandidates = await collectFrameCandidates(page);
  return [...mainCandidates, ...frameCandidates];
}

async function collectFrameCandidates(page: Page): Promise<Omit<Candidate, "id" | "canonical" | "prototypeIntent" | "retained" | "retentionReasons">[]> {
  const candidates: Omit<Candidate, "id" | "canonical" | "prototypeIntent" | "retained" | "retentionReasons">[] = [];
  for (const frame of page.frames().filter((frame) => frame !== page.mainFrame()).slice(0, 12)) {
    candidates.push(...await collectSingleFrameCandidates(frame).catch(() => []));
  }
  return candidates;
}

async function collectSingleFrameCandidates(frame: Frame): Promise<Omit<Candidate, "id" | "canonical" | "prototypeIntent" | "retained" | "retentionReasons">[]> {
  return frame.evaluate(String.raw`(() => {
    const selector = "button,a,input[type='button'],input[type='submit'],[role='button'],[role='link'],[tabindex],[onclick]";
    const consentPattern = /cookie|cookies|consent|privacy|tracking|analytics|advertising|marketing|preferences?|settings|choices?|onetrust|optanon|cmp|trustarc|didomi|usercentrics|cookiebot/i;
    const out = [];
    for (const element of Array.from(document.querySelectorAll(selector)).slice(0, 500)) {
      const label = [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element instanceof HTMLInputElement ? element.value || element.placeholder : "",
        element.textContent,
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (!label || label.length > 160) continue;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getAttribute("aria-hidden") !== "true" &&
        Number.parseFloat(style.opacity || "1") > 0.05;
      let current = element;
      let contextText = "";
      let fixedOrSticky = false;
      let dialogLike = false;
      let footerOrNav = false;
      let highZIndex = false;
      for (let depth = 0; current && depth < 10; depth += 1) {
        const currentStyle = window.getComputedStyle(current);
        const role = (current.getAttribute("role") || "").toLowerCase();
        const idClassRole = [current.tagName, current.getAttribute("id"), current.getAttribute("class"), role].filter(Boolean).join(" ");
        const text = (current.textContent || "").replace(/\s+/g, " ").trim();
        if (!contextText || (consentPattern.test(text + " " + idClassRole) && text.length < 3_000)) {
          contextText = text.slice(0, 1_000);
        }
        fixedOrSticky ||= currentStyle.position === "fixed" || currentStyle.position === "sticky";
        dialogLike ||= role === "dialog" || role === "alertdialog" || role === "banner" || current.getAttribute("aria-modal") === "true";
        footerOrNav ||= /^(?:footer|header|nav|aside)$/i.test(current.tagName) || /footer|header|nav|menu|breadcrumb/i.test(idClassRole);
        const zIndex = Number.parseInt(currentStyle.zIndex || "0", 10);
        highZIndex ||= Number.isFinite(zIndex) && zIndex >= 10;
        current = current.parentElement;
      }
      out.push({
        lane: "dom",
        label,
        role: element.getAttribute("role") || undefined,
        tagName: element.tagName.toLowerCase(),
        selectorHint: element.getAttribute("id") ? "#" + element.getAttribute("id") : element.tagName.toLowerCase(),
        visible,
        bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        surface: {
          consentContext: consentPattern.test(contextText),
          fixedOrSticky,
          dialogLike,
          footerOrNav,
          viewportIntersecting: rect.bottom >= -20 && rect.top <= window.innerHeight + 20 && rect.right >= -20 && rect.left <= window.innerWidth + 20,
          highZIndex,
          contextText,
        },
      });
    }
    return out;
  })()`);
}

async function collectAccessibilityCandidates(page: Page): Promise<Omit<Candidate, "id" | "canonical" | "prototypeIntent" | "retained" | "retentionReasons">[]> {
  const session = await page.context().newCDPSession(page);
  const axTree = await session.send("Accessibility.getFullAXTree").catch(() => ({ nodes: [] as Array<Record<string, unknown>> }));
  const candidates: Omit<Candidate, "id" | "canonical" | "prototypeIntent" | "retained" | "retentionReasons">[] = [];
  for (const node of (axTree.nodes ?? []).slice(0, 2_000)) {
    const role = axValue(node.role);
    const label = axValue(node.name);
    const backendNodeId = typeof node.backendDOMNodeId === "number" ? node.backendDOMNodeId : undefined;
    if (!backendNodeId || !label || !["button", "link", "menuitem", "checkbox", "radio", "switch"].includes(role.toLowerCase())) {
      continue;
    }
    const box = await bboxForBackendNode(session, backendNodeId).catch(() => undefined);
    candidates.push({
      lane: "accessibility",
      label: label.slice(0, 160),
      role,
      visible: Boolean(box && box.width > 0 && box.height > 0),
      bbox: box,
      surface: await surfaceForPoint(page, box),
    });
  }
  await session.detach().catch(() => undefined);
  return candidates;
}

function axValue(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const maybe = value as { value?: unknown };
  return typeof maybe.value === "string" ? maybe.value.replace(/\s+/g, " ").trim() : "";
}

async function bboxForBackendNode(
  session: Awaited<ReturnType<BrowserContext["newCDPSession"]>>,
  backendNodeId: number,
): Promise<{ x: number; y: number; width: number; height: number } | undefined> {
  const resolved = await session.send("DOM.resolveNode", { backendNodeId });
  const objectId = resolved.object.objectId;
  if (!objectId) return undefined;
  const result = await session.send("Runtime.callFunctionOn", {
    objectId,
    returnByValue: true,
    functionDeclaration: `function() {
      const rect = this.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }`,
  });
  const value = result.result.value as { x?: number; y?: number; width?: number; height?: number } | undefined;
  if (!value || typeof value.width !== "number" || typeof value.height !== "number") return undefined;
  return {
    x: value.x ?? 0,
    y: value.y ?? 0,
    width: value.width,
    height: value.height,
  };
}

async function surfaceForPoint(
  page: Page,
  box?: { x: number; y: number; width: number; height: number },
): Promise<Candidate["surface"]> {
  if (!box) {
    return emptySurface();
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return page.evaluate(String.raw`(() => {
    const x = ${JSON.stringify(x)};
    const y = ${JSON.stringify(y)};
    const element = document.elementFromPoint(x, y);
    const pattern = /cookie|cookies|consent|privacy|tracking|analytics|advertising|marketing|preferences?|settings|choices?|onetrust|optanon|cmp|trustarc|didomi|usercentrics|cookiebot/i;
    if (!element) {
      return {
        consentContext: false,
        fixedOrSticky: false,
        dialogLike: false,
        footerOrNav: false,
        viewportIntersecting: false,
        highZIndex: false,
        contextText: "",
      };
    }
    let current: Element | null = element;
    let contextText = "";
    let fixedOrSticky = false;
    let dialogLike = false;
    let footerOrNav = false;
    let highZIndex = false;
    for (let depth = 0; current && depth < 10; depth += 1) {
      const style = window.getComputedStyle(current);
      const role = (current.getAttribute("role") || "").toLowerCase();
      const idClassRole = [current.tagName, current.getAttribute("id"), current.getAttribute("class"), role].filter(Boolean).join(" ");
      const text = (current.textContent || "").replace(/\s+/g, " ").trim();
      if (!contextText || (pattern.test(text + " " + idClassRole) && text.length < 3_000)) contextText = text.slice(0, 1_000);
      fixedOrSticky ||= style.position === "fixed" || style.position === "sticky";
      dialogLike ||= role === "dialog" || role === "alertdialog" || role === "banner" || current.getAttribute("aria-modal") === "true";
      footerOrNav ||= /^(?:footer|header|nav|aside)$/i.test(current.tagName) || /footer|header|nav|menu|breadcrumb/i.test(idClassRole);
      const zIndex = Number.parseInt(style.zIndex || "0", 10);
      highZIndex ||= Number.isFinite(zIndex) && zIndex >= 10;
      current = current.parentElement;
    }
    return {
      consentContext: pattern.test(contextText),
      fixedOrSticky,
      dialogLike,
      footerOrNav,
      viewportIntersecting: x >= -20 && y >= -20 && x <= window.innerWidth + 20 && y <= window.innerHeight + 20,
      highZIndex,
      contextText,
    };
  })()`).catch(() => emptySurface());
}

function emptySurface(): Candidate["surface"] {
  return {
    consentContext: false,
    fixedOrSticky: false,
    dialogLike: false,
    footerOrNav: false,
    viewportIntersecting: false,
    highZIndex: false,
    contextText: "",
  };
}

function enrichCandidate(
  candidate: Omit<Candidate, "id" | "canonical" | "prototypeIntent" | "retained" | "retentionReasons">,
  index: number,
): Candidate {
  const canonical = classifyConsentControlLabel({
    label: candidate.label,
    contextText: candidate.surface.contextText,
    hasConsentContext: candidate.surface.consentContext,
  });
  const prototypeIntent = prototypeClassify(candidate.label, candidate.surface.contextText, candidate.surface.consentContext);
  const retentionReasons: string[] = [];
  if (!candidate.visible) retentionReasons.push("not_visible");
  if (!candidate.surface.consentContext) retentionReasons.push("no_consent_context");
  if (candidate.surface.footerOrNav && !candidate.surface.dialogLike && !candidate.surface.fixedOrSticky) retentionReasons.push("page_chrome");
  if (prototypeIntent === "unknown") retentionReasons.push("prototype_unknown");
  const retained = retentionReasons.length === 0;
  return {
    ...candidate,
    id: `${candidate.lane}-${index + 1}`,
    canonical,
    prototypeIntent,
    retained,
    retentionReasons,
  };
}

function prototypeClassify(label: string, contextText: string, hasConsentContext: boolean): PrototypeIntent {
  const normalized = normalize(`${label} ${contextText.slice(0, 200)}`);
  const normalizedLabel = normalize(label);
  if (!hasConsentContext && !/\b(cookie|cookies|consent|privacy|analytics|tracking|advertising|marketing)\b/.test(normalized)) {
    return "unknown";
  }
  if (/\b(do not sell|do not share|privacy choices|privacy rights|opt out|opt-out)\b/.test(normalizedLabel)) {
    return "privacy_opt_out";
  }
  if (/\b(reject|decline|refuse|deny|disagree|disable|turn off|necessary only|essential only|only necessary|only essential|without accepting|without consent|sans accepter|tout refuser|ablehnen|nur notwendige)\b/.test(normalizedLabel)) {
    return "reject";
  }
  if (/\b(allow|accept|agree|consent|akzeptieren|accepter|tout accepter|autoriser)\b/.test(normalizedLabel)) {
    return "accept";
  }
  if (/\b(settings|preferences|preference center|manage|customize|options|choices|learn more|details|einstellungen|préférences|paramètres|choix)\b/.test(normalizedLabel)) {
    return "options";
  }
  return "unknown";
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’´`]/g, "'")
    .replace(/[\u00a0\t\r\n]+/g, " ")
    .replace(/[.,;:!?()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function mergeCandidates(candidates: Omit<Candidate, "id" | "canonical" | "prototypeIntent" | "retained" | "retentionReasons">[]) {
  const seen = new Set<string>();
  const merged: typeof candidates = [];
  for (const candidate of candidates) {
    const box = candidate.bbox;
    const boxKey = box ? `${Math.round(box.x / 8)}:${Math.round(box.y / 8)}:${Math.round(box.width / 8)}:${Math.round(box.height / 8)}` : "none";
    const key = `${normalize(candidate.label)}:${boxKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }
  return merged.sort((left, right) =>
    candidatePriority(right) - candidatePriority(left)
  ).slice(0, 300);
}

function candidatePriority(candidate: Omit<Candidate, "id" | "canonical" | "prototypeIntent" | "retained" | "retentionReasons">): number {
  const label = normalize(candidate.label);
  return (
    (candidate.visible ? 100 : 0) +
    (candidate.surface.consentContext ? 80 : 0) +
    (candidate.surface.dialogLike ? 40 : 0) +
    (candidate.surface.fixedOrSticky ? 30 : 0) +
    (candidate.surface.highZIndex ? 20 : 0) +
    (/\b(accept|reject|decline|allow|options|settings|preferences|ablehnen|akzeptieren|more options)\b/.test(label) ? 50 : 0) -
    (candidate.surface.footerOrNav ? 30 : 0)
  );
}

function hasConsentHint(text: string): boolean {
  return /cookie|cookies|consent|privacy|tracking|analytics|advertising|marketing|preferences?|settings|choices?|onetrust|optanon|cmp/i.test(text);
}

function slugForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  } catch {
    return url.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  }
}

function markdownFor(results: SiteResult[], outDir: string): string {
  const lines = [
    "# Consent Control Calibration",
    "",
    `Output: ${outDir}`,
    "",
    "| Site | Status | Accept | Reject | Options | Retained labels | Screenshot |",
    "|---|---:|---:|---:|---:|---|---|",
  ];
  for (const result of results) {
    lines.push([
      result.finalUrl ?? result.url,
      result.status,
      result.acceptObserved ? "yes" : "no",
      result.rejectObserved ? "yes" : "no",
      result.optionsObserved ? "yes" : "no",
      result.retainedLabels.length > 0 ? result.retainedLabels.map((label) => label.replace(/\|/g, "\\|")).join("<br>") : "-",
      result.screenshotPath ? `[viewport](file://${result.screenshotPath})` : "-",
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("", "## Candidate Details", "");
  for (const result of results) {
    lines.push(`### ${result.finalUrl ?? result.url}`, "");
    if (result.error) {
      lines.push(`Error: ${result.error}`, "");
      continue;
    }
    lines.push("| Keep | Lane | Label | Prototype | Canonical | Reasons | Surface |");
    lines.push("|---:|---|---|---|---|---|---|");
    for (const candidate of result.candidates.filter((candidate) =>
      candidate.retained ||
      candidate.prototypeIntent !== "unknown" ||
      candidate.canonical.intent !== "unknown"
    ).slice(0, 40)) {
      lines.push([
        candidate.retained ? "yes" : "no",
        candidate.lane,
        candidate.label.replace(/\|/g, "\\|"),
        candidate.prototypeIntent,
        `${candidate.canonical.intent}${candidate.canonical.matchedTerm ? `:${candidate.canonical.matchedTerm}` : ""}`,
        candidate.retentionReasons.join("<br>") || "-",
        [
          candidate.surface.consentContext ? "context" : "no-context",
          candidate.surface.fixedOrSticky ? "fixed" : null,
          candidate.surface.dialogLike ? "dialog" : null,
          candidate.surface.footerOrNav ? "chrome" : null,
          candidate.surface.viewportIntersecting ? "viewport" : null,
          candidate.surface.highZIndex ? "z" : null,
        ].filter(Boolean).join(", "),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
