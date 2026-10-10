import axe, { type AxeResults, type Result } from "axe-core";
import type { Page } from "playwright";
import {
  ACCESSIBILITY_AUDIT_BUDGET_MS, ACCESSIBILITY_AUDIT_VERSION, ACCESSIBILITY_LIMITS,
  ACCESSIBILITY_WCAG_TAGS, accessibilityAuditObservationSchema,
  type AccessibilityAuditObservation, type AccessibilityRuleObservation,
} from "@certscore/contracts";

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

function normalizeRule(rule: Result): AccessibilityRuleObservation {
  return {
    ruleId: rule.id, impact: rule.impact ?? null, tags: rule.tags.slice(0, 24),
    help: safeText(rule.help, 300), description: safeText(rule.description, 600), helpUrl: rule.helpUrl,
    nodeCount: rule.nodes.length,
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
        selectors: node.target.slice(0, ACCESSIBILITY_LIMITS.selectorsPerNode).map(target => Array.isArray(target)
          ? target.slice(0, 8).map(value => safeText(value, 400)) : safeText(target, 400)),
        htmlSnippet: safeHtml(node.html),
        failureSummary: safeText(node.failureSummary ?? node.any[0]?.message ?? rule.help, 800),
        ...(Object.keys(colorContrast).length ? { colorContrast } : {}),
      };
    }),
  };
}

export function unavailableAccessibilityAudit(input: {
  scanId: string; documentUrl: string; documentToken?: string | null;
  reason: string; status?: "limited" | "failed" | "not_testable"; startedAtMs?: number;
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
  const work = async () => {
    const frames = input.page.frames(), frameUrls = frames.map(frame => frame.url()), limitations: string[] = [];
    let frameNavigated = false;
    const onNavigation = () => { frameNavigated = true; };
    input.page.on("framenavigated", onNavigation);
    try {
    if (frames.length > 16) limitations.push("frame_limit");
    for (const frame of frames.slice(0, 16)) {
      if (stopped || input.signal?.aborted) throw new Error("cancelled");
      try { await frame.evaluate(axe.source + "\n;void 0;"); }
      catch { if (frame === input.page.mainFrame()) throw new Error("engine_injection_failed"); limitations.push("frame_unavailable"); }
    }
    if (stopped) throw new Error("cancelled");
    const results = await input.page.evaluate(async (tags): Promise<AxeResults> => {
      const engine = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<AxeResults> } }).axe;
      return engine.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations", "incomplete"], preload: false });
    }, [...ACCESSIBILITY_WCAG_TAGS]);
    if (input.page.url() !== documentUrl || input.documentIdentity()?.token !== documentToken) return unavailable("document_changed");
    const afterFrames = input.page.frames();
    if (frameNavigated || frames.length !== afterFrames.length || frames.some((frame, i) => frame !== afterFrames[i] || frame.url() !== frameUrls[i])) {
      return unavailable("frames_changed");
    }
    if (results.violations.length > ACCESSIBILITY_LIMITS.rules || results.incomplete.length > ACCESSIBILITY_LIMITS.rules) limitations.push("rule_limit");
    if (results.incomplete.length) limitations.push("rules_need_review");
    const rulesEvaluated = [...new Set([...results.violations, ...results.incomplete, ...results.passes, ...results.inapplicable].map(rule => rule.id))];
    if (rulesEvaluated.length > ACCESSIBILITY_LIMITS.rules) return unavailable("rule_limit");
    const observation = {
      contractVersion: ACCESSIBILITY_AUDIT_VERSION, required: true, scanId: input.scanId, sourceLane: "runtime_evidence",
      scope: "starting_page_rendered_content", documentUrl, documentToken, engine: "axe-core", engineVersion: results.testEngine.version,
      configuredTags: [...ACCESSIBILITY_WCAG_TAGS], status: limitations.length ? "limited" : "completed",
      startedAt: new Date(startedAtMs).toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - startedAtMs,
      rulesEvaluated, violations: results.violations.slice(0, ACCESSIBILITY_LIMITS.rules).map(normalizeRule),
      reviewItems: results.incomplete.slice(0, ACCESSIBILITY_LIMITS.rules).map(normalizeRule), limitations: [...new Set(limitations)].slice(0, 16),
    };
    if (Buffer.byteLength(JSON.stringify(observation), "utf8") > ACCESSIBILITY_LIMITS.evidenceBytes) return unavailable("evidence_size_limit");
    return accessibilityAuditObservationSchema.parse(observation);
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
  } catch { return unavailable("audit_execution_failed", "failed"); }
  finally {
    if (timer) clearTimeout(timer);
    if (onAbort) input.signal?.removeEventListener("abort", onAbort);
  }
}
