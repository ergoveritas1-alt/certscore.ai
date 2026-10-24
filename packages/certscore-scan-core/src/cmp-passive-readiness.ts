import type { KnownCmpDefinition } from "@website-signal-risk-scanner/shared";

export type PassiveReadinessEntry = { selector: string; api?: string; initiallyVisible: boolean };

export function passiveReadinessEntries(definitions: KnownCmpDefinition[], visible: number[]): PassiveReadinessEntry[] {
  return definitions.map((entry, index) => ({
    selector: entry.preferenceScopeSelector ?? entry.preferenceInspection?.entranceSelector ?? entry.domSelectors!.join(","),
    api: entry.passiveConfigurationApi,
    initiallyVisible: visible.includes(index),
  }));
}

/** Poll only registered roots and the existing read-only configuration method.
 * Newly visible UI can satisfy the existing checkpoint for providers without an
 * SDK recipe. A script download is never readiness or provider attribution. */
export function passiveCmpReadyInDocument(entries: PassiveReadinessEntry[]): boolean {
  const deadline = performance.now() + 10;
  for (const entry of entries) {
    if (performance.now() >= deadline) return false;
    if (!entry.initiallyVisible) {
      const nodes = document.querySelectorAll(entry.selector);
      if (nodes.length <= 1000) for (const node of nodes) {
        if (performance.now() >= deadline) return false;
        let ancestor: Element | null = node, visible = true;
        for (let depth = 0; ancestor && depth < 64; depth++) {
          if (performance.now() >= deadline) return false;
          const style = getComputedStyle(ancestor);
          if (style.display === "none" || style.opacity === "0" || style.visibility !== "visible" || ancestor.matches('[aria-hidden="true" i], [inert]')) { visible = false; break; }
          ancestor = ancestor.parentElement;
        }
        const box = node.getBoundingClientRect();
        if (visible && !ancestor && box.width > 0 && box.height > 0) return true;
      }
    }
    if (!entry.api) continue;
    let value: unknown = window, receiver: unknown;
    const parts = entry.api.split(".");
    for (const [position, part] of parts.entries()) {
      if (!value || typeof value !== "object" && typeof value !== "function") { value = undefined; break; }
      let owner: object | null = value as object;
      let descriptor = Object.getOwnPropertyDescriptor(owner, part);
      if (position === parts.length - 1) for (let depth = 0; !descriptor && owner && depth < 4; depth++) {
        owner = Object.getPrototypeOf(owner);
        if (owner === Object.prototype || owner === Function.prototype) break;
        if (owner) descriptor = Object.getOwnPropertyDescriptor(owner, part);
      }
      if (!descriptor || !("value" in descriptor)) { value = undefined; break; }
      receiver = value; value = descriptor.value;
    }
    if (typeof value !== "function") continue;
    try {
      const data = Reflect.apply(value, receiver, []);
      const groups = data && typeof data === "object" ? Object.getOwnPropertyDescriptor(data, "Groups") : undefined;
      if (groups && "value" in groups && Array.isArray(groups.value) && groups.value.length > 0) return true;
    } catch { /* A present but unready method is not loaded inventory. */ }
  }
  return false;
}
