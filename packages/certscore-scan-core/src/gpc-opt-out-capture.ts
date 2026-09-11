import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { GPC_OPT_OUT_ADAPTER_VERSION, GPC_STATUS_MESSAGES, gpcOptOutObservationSchema, gpcUscaStateSchema, type BrowserDocumentIdentity } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { gpcDocumentHash } from "./gpc-signal-capture.js";

/** Passive, one evaluation, no polling/listeners/clicks. Called only by the local prototype. */
export async function captureGpcOptOutObservation(page: Page, input: {
  scanId: string; scanStartedAtMs: number;
  binding?: { captureId: string; documentIdentity: () => BrowserDocumentIdentity | undefined };
}) {
  const before = input.binding?.documentIdentity();
  const sample = await page.evaluate(({ scopes, messages }) => {
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
    const p = ping as Record<string, unknown> | null;
    let state: Record<string, unknown> | null = null;
    let status = !present ? "unavailable" : "not_ready";
    if (callbackCount === 1 && callbackSucceeded && p) {
      if (p.gppVersion !== "1.1") status = "unsupported";
      else if (p.cmpStatus === "loaded" && p.signalStatus === "ready") {
        const sections = (p.parsedSections as Record<string, unknown> | undefined)?.usca;
        if (!Array.isArray(p.applicableSections) || !p.applicableSections.includes(8) ||
          !Array.isArray(p.sectionList) || !p.sectionList.includes(8)) status = "unsupported";
        else if (new Set(p.applicableSections).size !== p.applicableSections.length ||
          new Set(p.sectionList).size !== p.sectionList.length ||
          !Array.isArray(sections) || sections.length < 1 || sections.length > 2) status = "invalid";
        else {
          const core = sections[0], gpc = sections[1];
          if (!core || typeof core !== "object" ||
            (gpc !== undefined && (!gpc || gpc.SubsectionType !== 1 || typeof gpc.Gpc !== "boolean"))) status = "invalid";
          else {
            status = "observed";
            state = { apiVersion: "1.1", sectionId: 8, sectionVersion: core.Version,
              cmpStatus: "loaded", signalStatus: "ready", saleNotice: core.SaleOptOutNotice,
              sharingNotice: core.SharingOptOutNotice, saleOptOut: core.SaleOptOut,
              sharingOptOut: core.SharingOptOut, gpc: gpc?.Gpc ?? null };
          }
        }
      }
    } else if (callbackCount > 1) status = "invalid";
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
      state, status, acknowledgment, truncated };
  }, { scopes: KNOWN_CMP_REGISTRY.map(cmp => ({ name: cmp.canonicalName, selectors: cmp.domSelectors ?? [] })), messages: GPC_STATUS_MESSAGES });
  const parsed = gpcUscaStateSchema.safeParse(sample.state);
  const usca = sample.status === "observed" && parsed.success ? parsed.data : null;
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
    gppStatus: sample.status === "observed" && !usca ? "invalid" : sample.status, usca,
    stateSha256: usca ? createHash("sha256").update(JSON.stringify(usca)).digest("hex") : null,
    acknowledgment: sample.acknowledgment, limitationKeys,
  });
}
