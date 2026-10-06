import type { Page } from "playwright";
import { buildCollectionSurfaceInventory } from "./collection-surface-inventory.js";

/** A bounded form-only DOM sample for the registered Accept window. It never
 * reads field values or page-wide text; the later screenshot independently
 * rebinds every retained control before taking masked pixels. */
export async function capturePostAcceptFormInventory(page: Page, scanStartedAtMs: number, cmpSelectors: string[]) {
  const snapshot = await page.evaluate((selectors) => {
    const scope = globalThis as typeof globalThis & { __name?: <T>(target: T) => T };
    scope.__name ??= function(target) { return target; };
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
        method, actionHostname,
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
  }, cmpSelectors);
  return buildCollectionSurfaceInventory(snapshot, scanStartedAtMs);
}
