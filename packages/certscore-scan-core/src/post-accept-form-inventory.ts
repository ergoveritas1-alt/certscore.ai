import type { Page } from "playwright";
import { randomUUID } from "node:crypto";
import { PRIVACY_EVIDENCE_LOCALE_REGISTRY } from "@certscore/contracts";
import { buildCollectionSurfaceInventory, type CollectionSurfaceCaptureSnapshot } from "./collection-surface-inventory.js";

// One binding per browser page; completed captures remove their handler. Keeping
// the inert binding avoids accumulating exposed functions across bounded reads.
const detectionBindings = new WeakMap<Page, { name: string; ready: Promise<void>;
  handlers: Map<string, (snapshot: CollectionSurfaceCaptureSnapshot, detectedAtEpochMs: number) => void> }>();

/** A bounded form-only DOM sample for the registered Accept window. It never
 * reads field values or page-wide text; the later screenshot independently
 * rebinds every retained control before taking masked pixels. */
export async function capturePostAcceptFormInventory(page: Page, scanStartedAtMs: number, cmpSelectors: string[], deadlineAtMs = Date.now(), detection?: {
  onDetected: (inventory: ReturnType<typeof buildCollectionSurfaceInventory>, detectedAtEpochMs: number) => void;
  signal: AbortSignal;
}) {
  const detectionId = randomUUID();
  let binding = detectionBindings.get(page);
  if (detection && !binding) {
    const name = `certscoreForm_${randomUUID().replaceAll("-", "")}`;
    const handlers = new Map<string, (snapshot: CollectionSurfaceCaptureSnapshot, detectedAtEpochMs: number) => void>();
    const ready = page.exposeBinding(name, (source, id, snapshot, detectedAtEpochMs) => {
      if (source.page === page && source.frame === page.mainFrame()) handlers.get(id)?.(snapshot, detectedAtEpochMs);
    });
    binding = { name, ready, handlers };
    detectionBindings.set(page, binding);
  }
  const bindingName = detection ? binding?.name : undefined;
  let delivered = false;
  let deliver: (snapshot: import("./collection-surface-inventory.js").CollectionSurfaceCaptureSnapshot) => void = () => {};
  const detected = new Promise<import("./collection-surface-inventory.js").CollectionSurfaceCaptureSnapshot>(resolve => { deliver = resolve; });
  const aborted = () => { rejectAbort(detection?.signal.reason ?? new Error("Form inventory capture cancelled")); };
  let rejectAbort: (reason: unknown) => void = () => {};
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
  try {
  if (bindingName && detection) {
    detection.signal.addEventListener("abort", aborted, { once: true });
    if (detection.signal.aborted) aborted();
    await Promise.race([binding!.ready, cancelled]);
    binding!.handlers.set(detectionId, (snapshot, detectedAtEpochMs) => {
      if (delivered || detection.signal.aborted ||
        !Number.isSafeInteger(detectedAtEpochMs) || detectedAtEpochMs > Date.now() || detectedAtEpochMs >= deadlineAtMs ||
        snapshot?.pageUrl !== page.url()) return;
      const inventory = buildCollectionSurfaceInventory(snapshot, scanStartedAtMs);
      if (!inventory.forms.length) return;
      detection.onDetected(inventory, detectedAtEpochMs);
      delivered = true;
      deliver(snapshot);
    });
  }
  const evaluation = page.evaluate(({ selectors, deadlineAtMs, privacyHints, bindingName, detectionId }) => {
    const scope = globalThis as typeof globalThis & { __name?: <T>(target: T) => T };
    scope.__name ??= function(target) { return target; };
    const read = () => {
    const candidates = document.querySelectorAll('input,textarea,select,[role="checkbox"],[role="switch"]');
    const groupRefs = new WeakMap<Element, string>();
    let nextGroup = 0, truncated = candidates.length > 250;
    const deadline = performance.now() + 20;
    const text = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim().slice(0, 120) || undefined;
    const excluded = (element: Element) => selectors.some(selector => {
      try { return Boolean(element.closest(selector)); } catch { return false; }
    });
    const label = (element: Element) => {
      const labelledBy = text((element.getAttribute("aria-labelledby") ?? "").split(/\s+/).slice(0, 4)
        .map(id => id ? document.getElementById(id)?.textContent ?? "" : "").join(" "));
      const id = element.getAttribute("id");
      const explicit = id ? Array.from(document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)).map(node => text(node.textContent)).find(Boolean) : undefined;
      return labelledBy ?? text(element.getAttribute("aria-label")) ?? explicit ?? text(element.closest("label")?.textContent) ??
        text(element.getAttribute("placeholder")) ?? text(element.getAttribute("name"));
    };
    const isVisible = (element: Element) => {
      if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0;
    };
    // Public notice text only: never read entered values or page-wide footer text.
    let disclosureBytes = 0;
    let disclosureRemainingMs = 5;
    const disclosureCache = new WeakMap<Element, { version: 1; excerpts: Array<{ text: string; association: "inside_form" | "adjacent_notice" | "described_by"; links: Array<{ label: string; url: string }> }>; truncated: boolean }>();
    const disclosureFor = (group: Element | null) => {
      if (!group) return undefined;
      const cached = disclosureCache.get(group);
      if (cached) return cached.excerpts.length ? cached : undefined;
      const result: NonNullable<ReturnType<typeof disclosureCache.get>> = { version: 1, excerpts: [], truncated: false };
      disclosureCache.set(group, result);
      if (disclosureRemainingMs <= 0) return undefined;
      const disclosureStarted = performance.now();
      const disclosureDeadline = disclosureStarted + disclosureRemainingMs;
      try {
        const candidates: Array<{ node: Element; association: "inside_form" | "adjacent_notice" | "described_by" }> = [];
        const blocks = group.querySelectorAll('p, label, small, [role="note"], a[href]');
        for (let i = 0; i < Math.min(blocks.length, 40); i++) candidates.push({ node: blocks[i]!, association: "inside_form" });
        result.truncated = blocks.length > 40;
        for (const id of (group.getAttribute("aria-describedby") ?? "").split(/\s+/).slice(0, 4)) {
          const node = document.getElementById(id);
          if (node) candidates.push({ node, association: "described_by" });
        }
        // Only direct neighbors of the form or its single exclusive wrapper.
        const exclusive = (node: Element | null): node is Element => Boolean(node &&
          !node.matches('body, main, header, footer, nav') && node.querySelectorAll('form, [role="form"]').length === 1);
        const parent = group.parentElement;
        const scopes = [group];
        if (exclusive(parent) && !parent.querySelector('header, footer, nav') && exclusive(parent.parentElement)) scopes.push(parent);
        for (const scope of scopes) {
          if (!exclusive(scope.parentElement)) continue;
          for (const neighbor of [scope.previousElementSibling, scope.nextElementSibling]) {
            if (!neighbor || neighbor.matches('header, footer, nav, form, [role="form"]') ||
              neighbor.querySelector('form, [role="form"], input, textarea, select, header, footer, nav')) continue;
            const notices = neighbor.matches('p, small, [role="note"], a[href]') ? [neighbor] :
              neighbor.matches('div, span') ? Array.from(neighbor.querySelectorAll('p, small, [role="note"], a[href]')).slice(0, 8) : [];
            for (const node of notices) candidates.push({node, association:'adjacent_notice'});
          }
        }
        const retained: Element[] = [];
        for (const { node, association } of candidates) {
          if (performance.now() >= disclosureDeadline) { result.truncated = true; break; }
          // A newsletter form may itself live in a footer. Keep its own
          // scoped notice, without treating the site's footer as disclosure.
          if (!isVisible(node) || excluded(node) || node.matches('header, footer, nav') ||
            node.closest('nav, [contenteditable="true"]') ||
            (association === 'described_by' && node.closest('footer') && !group.contains(node)) ||
            retained.some(other => other.contains(node))) continue;
          const owner = node.closest('form, [role="form"]');
          if (owner && owner !== group) continue;
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          const pieces: string[] = [];
          let visited = 0;
          while (walker.nextNode() && visited++ < 80) {
            const textNode = walker.currentNode;
            const parentNode = textNode.parentElement;
            if (!parentNode || parentNode.closest('input, textarea, select, script, style, [contenteditable="true"]') || !isVisible(parentNode)) continue;
            pieces.push((textNode.textContent ?? "").slice(0, 700));
          }
          const original = pieces.join(" ").replace(/\s+/g, " ").trim();
          const normalized = original.toLocaleLowerCase();
          if (!original || !privacyHints.some(hint => normalized.includes(hint))) continue;
          if (result.excerpts.length >= 2) { result.truncated = true; break; }
          const text = original.slice(0, 600).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email redacted]");
          const links: Array<{ label: string; url: string }> = [];
          const anchors = node.matches('a[href]') ? [node] : Array.from(node.querySelectorAll('a[href]')).slice(0, 6);
          for (const anchor of anchors) {
            try {
              const url = new URL(anchor.getAttribute("href") ?? "", location.href);
              const label = (anchor.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
              const normalizedLabel = label.toLocaleLowerCase();
              if (!/^https?:$/.test(url.protocol) || !label || !privacyHints.some(hint => normalizedLabel.includes(hint))) continue;
              url.search = ""; url.hash = ""; url.username = ""; url.password = "";
              if (url.href.length <= 500 && links.length < 2) links.push({ label, url: url.href });
            } catch {}
          }
          const excerpt = { text, association, links };
          const previousSize = new TextEncoder().encode(JSON.stringify(result)).length;
          const next = { ...result, excerpts: [...result.excerpts, excerpt], truncated: result.truncated || original.length > 600 || visited >= 80 };
          const nextSize = new TextEncoder().encode(JSON.stringify(next)).length;
          const increase = result.excerpts.length ? nextSize - previousSize : nextSize;
          if (disclosureBytes + increase > 1024) { result.truncated = true; break; }
          disclosureBytes += increase;
          result.excerpts = next.excerpts;
          result.truncated = next.truncated;
          retained.push(node);
        }
        return result.excerpts.length ? result : undefined;
      } finally {
        // Share five milliseconds of disclosure work across forms. Layout and
        // ordinary field inspection between calls must not spend that budget.
        disclosureRemainingMs = Math.max(0, disclosureRemainingMs - (performance.now() - disclosureStarted));
      }
    };
    const rows = [];
    for (let index = 0; index < Math.min(candidates.length, 250); index++) {
      if (performance.now() > deadline) { truncated = true; break; }
      const element = candidates.item(index)!;
      const type = (element.getAttribute("type") || element.tagName.toLowerCase()).toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type) ||
        element.closest('[hidden],[inert],[aria-hidden="true"]') || excluded(element)) continue;
      const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      if (bounds.width <= 0 || bounds.height <= 0 || style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") <= 0) continue;
      const nativeForm = (element as HTMLInputElement).form ?? element.closest("form");
      const roleForm = nativeForm ? null : element.closest('[role="form"]');
      const group = nativeForm ?? roleForm;
      if (!group) continue;
      let groupKey = groupRefs.get(group);
      if (!groupKey) {
        groupKey = `${nativeForm ? "native_form" : "role_form"}_${nextGroup++}`;
        groupRefs.set(group, groupKey);
      }
      const input = element as HTMLInputElement;
      const role = element.getAttribute("role");
      const controlKind = role === "switch" ? "switch" as const : type === "checkbox" || role === "checkbox" ? "checkbox" as const : type === "radio" ? "radio" as const : undefined;
      const ariaChecked = element.getAttribute("aria-checked");
      const checkedState = element instanceof HTMLInputElement && ["checkbox", "radio"].includes(type)
        ? input.indeterminate ? "mixed" as const : input.checked ? "checked" as const : "unchecked" as const
        : ariaChecked === "true" ? "checked" as const : ariaChecked === "false" ? "unchecked" as const : ariaChecked === "mixed" ? "mixed" as const : "unknown" as const;
      const rawAction = nativeForm?.getAttribute("action")?.trim();
      let actionHostname: string | undefined;
      try { if (nativeForm) actionHostname = rawAction ? new URL(rawAction, location.href).hostname || undefined : location.hostname || undefined; } catch {}
      const method = nativeForm ? Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, "method")?.get?.call(nativeForm) as string | undefined : undefined;
      rows.push({
        groupKey, structure: nativeForm ? "native_form" as const : "role_form" as const,
        title: text(group.getAttribute("aria-label") ?? group.querySelector("legend,h1,h2,h3")?.textContent),
        method, actionHostname, privacyDisclosure: disclosureFor(group),
        elementType: (["input", "textarea", "select"].includes(element.tagName.toLowerCase()) ? element.tagName.toLowerCase() : "custom_control") as "input" | "textarea" | "select" | "custom_control",
        inputType: type, label: label(element), autocompleteToken: text(element.getAttribute("autocomplete")),
        ...(controlKind ? { controlKind, checkedState } : {}),
        required: input.required === true || element.getAttribute("aria-required") === "true",
        disabled: input.disabled === true || element.getAttribute("aria-disabled") === "true",
        readOnly: "readOnly" in input && input.readOnly === true,
        domOrder: index,
      });
    }
    return { pageUrl: location.href, documentReadyState: document.readyState,
      inspectedFieldCandidateCount: Math.min(candidates.length, 250), candidateScanTruncated: truncated, rows };
    };
    return new Promise<ReturnType<typeof read> & { detectedAtEpochMs?: number }>(resolve => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let finished = false, queued = false;
      const observer = new MutationObserver(() => {
        if (finished || queued) return;
        queued = true;
        queueMicrotask(() => { queued = false; poll(); });
      });
      const poll = () => {
        if (finished) return;
        const current = read();
        const detectedAtEpochMs = Date.now();
        if (current.rows.length || detectedAtEpochMs >= deadlineAtMs) {
          finished = true;
          observer.disconnect();
          if (timer) clearTimeout(timer);
          // Notify the worker before awaiting the evaluation return. Only a
          // directly observed, in-window field can activate the late allowance.
          if (bindingName && current.rows.length && detectedAtEpochMs < deadlineAtMs) {
            const notify = (globalThis as unknown as Record<string, (...args: unknown[]) => Promise<void>>)[bindingName];
            void notify?.(detectionId, current, detectedAtEpochMs).catch(() => {});
          }
          resolve({ ...current, detectedAtEpochMs });
          return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(poll, Math.min(50, Math.max(1, deadlineAtMs - Date.now())));
      };
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"] });
      poll();
    });
  }, { selectors: cmpSelectors, deadlineAtMs, bindingName, detectionId, privacyHints: [...new Set(PRIVACY_EVIDENCE_LOCALE_REGISTRY.flatMap(entry => [...entry.privacyPolicyLabels, ...entry.contextHints]).map(hint => hint.toLocaleLowerCase()))] });
  const snapshot = await (detection ? Promise.race([evaluation, detected, cancelled]) : evaluation);
  if (detection && !delivered && "detectedAtEpochMs" in snapshot && typeof snapshot.detectedAtEpochMs === "number" &&
    snapshot.detectedAtEpochMs < deadlineAtMs && !detection.signal.aborted) {
    detection.onDetected(buildCollectionSurfaceInventory(snapshot, scanStartedAtMs), snapshot.detectedAtEpochMs);
  }
  return buildCollectionSurfaceInventory(snapshot, scanStartedAtMs);
  } finally {
    detection?.signal.removeEventListener("abort", aborted);
    binding?.handlers.delete(detectionId);
  }
}
