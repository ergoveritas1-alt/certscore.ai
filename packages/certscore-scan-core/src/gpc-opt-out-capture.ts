import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { GPC_OPT_OUT_ADAPTER_VERSION, GPC_STATUS_MESSAGES, gpcOptOutObservationSchema, gpcUscaStateSchema, gpcUsNationalStateSchema, type BrowserDocumentIdentity } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { parseGpcGppPing } from "./gpc-gpp-parser.js";
import { gpcDocumentHash } from "./gpc-signal-capture.js";

/** Passive terminal readback plus optional bounded listener history; local prototype only. */
export async function captureGpcOptOutObservation(page: Page, input: {
  scanId: string; scanStartedAtMs: number;
  monitorKey?: string;
  onMonitorFinished?: (value: { callbacks: number; dropped: number; registered: boolean }) => void;
  binding?: { captureId: string; documentIdentity: () => BrowserDocumentIdentity | undefined };
}) {
  const before = input.binding?.documentIdentity();
  const readback = ({ scopes, messages, monitorKey }: { scopes: Array<{ name: string; selectors: readonly string[] }>; messages: readonly string[]; monitorKey?: string }) => {
    const monitor = monitorKey ? (window as unknown as Record<string, any>)[monitorKey]?.finish() : undefined;
    const startedUrl = location.href, timeOrigin = performance.timeOrigin;
    let ping: Record<string, unknown> | null = null;
    let callbackCount = 0, callbackSucceeded = false, accepting = true;
    const w = window as unknown as { __gpp?: (command: string, callback: (data: unknown, success: boolean) => void) => void };
    const present = typeof w.__gpp === "function";
    try {
      if (present) w.__gpp!("ping", (data, success) => {
        if (!accepting) return;
        callbackCount++;
        callbackSucceeded = success === true;
        if (data && typeof data === "object") ping = data as Record<string, unknown>;
      });
    } catch { callbackSucceeded = false; }
    accepting = false;
    // GPP 1.1 generic commands must callback synchronously. Do not wait for a
    // queued/loading CMP or retain raw GPP strings / unrelated section data.
    // Retain only the four explicit state/notice fields and optional GPC bit.
    // Raw GPP strings and unrelated sections never leave the page.
    const p = ping as Record<string, any> | null;
    const shortString = (v: unknown) => typeof v === "string" && v.length <= 32 ? v : null;
    const number = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) ? v : null;
    const safeSection = (c: any) => c && typeof c === "object" ? {
      Version: number(c.Version), SaleOptOutNotice: number(c.SaleOptOutNotice), SharingOptOutNotice: number(c.SharingOptOutNotice),
      SaleOptOut: number(c.SaleOptOut), SharingOptOut: number(c.SharingOptOut),
      ...(c.SubsectionType !== undefined ? { SubsectionType: number(c.SubsectionType) } : {}),
      ...(c.GpcSegmentType !== undefined ? { GpcSegmentType: number(c.GpcSegmentType) } : {}),
      ...(c.Gpc !== undefined ? { Gpc: typeof c.Gpc === "boolean" ? c.Gpc : null } : {}),
    } : null;
    const safePing = p ? { gppVersion: shortString(p.gppVersion), cmpStatus: shortString(p.cmpStatus), signalStatus: shortString(p.signalStatus),
      applicableSections: Array.isArray(p.applicableSections) ? p.applicableSections.slice(0, 4).map(number) : null,
      sectionList: Array.isArray(p.sectionList) ? p.sectionList.slice(0, 33).map(number) : null,
      parsedSections: Object.fromEntries(["usca", "usnat"].map(key => [key,
        Array.isArray(p.parsedSections?.[key]) ? p.parsedSections[key].slice(0, 3).map(safeSection) : safeSection(p.parsedSections?.[key])])) } : null;
    const acknowledgment: Array<{ cmp: string; scopeSelector: string; message: string; source: "visible_cmp_live_status" }> = [];
    const seen = new Set<Element>();
    let truncated = false;
    for (const scope of scopes) {
      for (const selector of scope.selectors) {
        const roots = document.querySelectorAll(selector);
        if (roots.length > 8) truncated = true;
        for (const root of Array.from(roots).slice(0, 8)) {
          const nodes = root.querySelectorAll<HTMLElement>('[role="status"], [aria-live="polite"], [aria-live="assertive"]');
          if (nodes.length > 32) truncated = true;
          for (const node of Array.from(nodes).slice(0, 32)) {
            if (seen.has(node)) continue;
            seen.add(node);
            const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
            if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 ||
              rect.top >= innerHeight || rect.left >= innerWidth || !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ||
              style.visibility !== "visible" || node.closest('[hidden], [aria-hidden="true"], template')) continue;
            const text = node.innerText.trim().replace(/\s+/g, " ");
            if (!(messages as readonly string[]).includes(text)) continue;
            if (acknowledgment.length === 8) { truncated = true; continue; }
            acknowledgment.push({ cmp: scope.name, scopeSelector: selector, message: text, source: "visible_cmp_live_status" });
          }
        }
      }
    }
    const preference = (navigator as Navigator & { globalPrivacyControl?: unknown }).globalPrivacyControl;
    return { startedUrl, finalUrl: location.href, timeOrigin, finalTimeOrigin: performance.timeOrigin,
      capturedAt: Date.now(), navigatorGpc: typeof preference === "boolean" ? preference : null,
      safePing, present, callbackCount, callbackSucceeded, acknowledgment, truncated,
      monitor: monitor ? { callbacks: monitor.callbacks, dropped: monitor.dropped, registered: monitor.listenerRegistered } : null,
      history: monitor?.history ?? [] };
  };
  const argumentsJson = JSON.stringify({ scopes: KNOWN_CMP_REGISTRY.map(cmp => ({ name: cmp.canonicalName, selectors: cmp.domSelectors ?? [] })), messages: GPC_STATUS_MESSAGES, monitorKey: input.monitorKey });
  // Keep tsx name helpers lexical; never patch the website global to run a probe.
  const sample = await page.evaluate<ReturnType<typeof readback>>(`(() => { const __name = (fn) => fn; return (${readback.toString()})(${argumentsJson}); })()`);
  if (sample.monitor) input.onMonitorFinished?.(sample.monitor);
  const decoded = !sample.present ? { status: "unavailable", state: null, reason: "api_unavailable", diagnosticCodes: ["api_unavailable"] as string[] } :
    sample.callbackCount > 1 ? { status: "invalid", state: null, reason: "duplicate_ping_callback", diagnosticCodes: ["duplicate_ping_callback"] as string[] } :
    sample.callbackCount !== 1 || !sample.callbackSucceeded ? { status: "not_ready", state: null, reason: "synchronous_ping_unavailable", diagnosticCodes: ["cmp_status_not_loaded"] as string[] } : parseGpcGppPing(sample.safePing);
  const usca = decoded.state?.sectionId === 8 ? gpcUscaStateSchema.parse(decoded.state) : null;
  const usnat = decoded.state?.sectionId === 7 ? gpcUsNationalStateSchema.parse(decoded.state) : null;
  const limitationKeys = [];
  const after = input.binding?.documentIdentity();
  const bindingStable = before?.token && before.token === after?.token;
  if (!bindingStable) limitationKeys.push("semantic_document_identity_unverified");
  if (sample.startedUrl !== sample.finalUrl || sample.timeOrigin !== sample.finalTimeOrigin || page.url() !== sample.finalUrl) limitationKeys.push("document_changed_during_semantic_readback");
  if (sample.truncated) limitationKeys.push("acknowledgment_capture_truncated");
  return gpcOptOutObservationSchema.parse({
    contractVersion: "certscore.gpc-opt-out-observation.prototype.v1", adapterVersion: GPC_OPT_OUT_ADAPTER_VERSION,
    scanId: input.scanId, documentUrlSha256: gpcDocumentHash(sample.finalUrl),
    captureBinding: input.binding && bindingStable ? { captureId: input.binding.captureId,
      documentIdentitySource: after!.source, documentToken: after!.token } : null,
    documentStartedAtMs: Math.max(0, Math.round(sample.timeOrigin - input.scanStartedAtMs)),
    capturedAtMs: Math.max(0, sample.capturedAt - input.scanStartedAtMs), navigatorGpc: sample.navigatorGpc,
    gppStatus: decoded.status, usca, usnat,
    gppDiagnostics: { reason: decoded.reason, callbackCount: sample.callbackCount,
      applicableSections: (sample.safePing?.applicableSections ?? []).filter((x): x is number => typeof x === "number"),
      sectionList: (sample.safePing?.sectionList ?? []).filter((x): x is number => typeof x === "number"),
      diagnosticCodes: decoded.diagnosticCodes,
    },
    acknowledgmentCaptureComplete: !sample.truncated,
    stateSha256: (usca ?? usnat) ? createHash("sha256").update(JSON.stringify(usca ?? usnat)).digest("hex") : null,
    stateTransitions: sample.history.map((row: any) => ({ observedAtMs: Math.max(0, row.at - input.scanStartedAtMs),
      status: row.status, state: row.state, stateSha256: row.state ? createHash("sha256").update(JSON.stringify(row.state)).digest("hex") : null,
      diagnosticCodes: row.diagnosticCodes })),
    acknowledgment: sample.acknowledgment, limitationKeys,
  });
}
