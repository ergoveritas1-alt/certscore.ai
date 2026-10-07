import type { Page } from "playwright";
import { PRIVACY_EVIDENCE_LOCALE_REGISTRY } from "@certscore/contracts";
import { buildCollectionSurfaceInventory } from "./collection-surface-inventory.js";

/** A bounded form-only DOM sample for the registered Accept window. It never
 * reads field values or page-wide text; the later screenshot independently
 * rebinds every retained control before taking masked pixels. */
export async function capturePostAcceptFormInventory(page: Page, scanStartedAtMs: number, cmpSelectors: string[], deadlineAtMs = Date.now()) {
  const snapshot = await page.evaluate(({ selectors, deadlineAtMs, privacyHints }) => {
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
      const id = element.getAttribute("id");
      const explicit = id ? Array.from(document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)).map(node => text(node.textContent)).find(Boolean) : undefined;
      return explicit ?? text(element.closest("label")?.textContent) ?? text(element.getAttribute("aria-label")) ??
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
        const parent = group.parentElement;
        if (parent && !parent.matches("body, main, header, footer, nav") && parent.querySelectorAll('form, [role="form"]').length === 1) {
          for (const node of [group.previousElementSibling, group.nextElementSibling]) {
            if (node?.matches('p, small, [role="note"]')) candidates.push({ node, association: "adjacent_notice" });
          }
        }
        const retained: Element[] = [];
        for (const { node, association } of candidates) {
          if (performance.now() >= disclosureDeadline) { result.truncated = true; break; }
          if (!isVisible(node) || excluded(node) || node.closest('footer, nav, [contenteditable="true"]') || retained.some(other => other.contains(node))) continue;
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
    return new Promise<ReturnType<typeof read>>(resolve => {
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
        if (current.rows.length || Date.now() >= deadlineAtMs) {
          finished = true;
          observer.disconnect();
          if (timer) clearTimeout(timer);
          resolve(current);
          return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(poll, Math.min(50, Math.max(1, deadlineAtMs - Date.now())));
      };
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"] });
      poll();
    });
  }, { selectors: cmpSelectors, deadlineAtMs, privacyHints: [...new Set(PRIVACY_EVIDENCE_LOCALE_REGISTRY.flatMap(entry => [...entry.privacyPolicyLabels, ...entry.contextHints]).map(hint => hint.toLocaleLowerCase()))] });
  return buildCollectionSurfaceInventory(snapshot, scanStartedAtMs);
}
