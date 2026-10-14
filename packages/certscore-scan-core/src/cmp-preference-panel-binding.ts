import type { ElementHandle, Locator } from "playwright";

/** Complete the existing panel-opening wait, rather than accepting visibility
 * before its accessible dialog attributes have finished rendering. Hold the
 * exact panel and parent nodes throughout; replacement never counts as ready. */
export async function verifyDeferredPreferencePanel(input: {
  panel: Locator; parent: ElementHandle; roles: string[]; remainingMs: number;
}) {
  return input.panel.evaluate(async (element, expected) => {
    const deadline = performance.now() + Math.max(0, expected.remainingMs);
    for (;;) {
      const role = element.getAttribute("role")?.slice(0, 32) ?? null;
      const named = Boolean(element.getAttribute("aria-label")?.trim()) ||
        (element.getAttribute("aria-labelledby") ?? "").trim().split(/\s+/).slice(0, 8).some(id => id &&
          (expected.parent as Element).querySelector(`#${CSS.escape(id)}`)?.textContent?.trim());
      const result = !expected.parent.isConnected ? "parent_missing_or_replaced" as const
        : !element.isConnected ? "panel_replaced" as const
        : !expected.parent.contains(element) ? "outside_parent" as const
        : !expected.roles.includes(role ?? "") ? "role_not_ready" as const
        : !named ? "name_not_ready" as const : "verified" as const;
      if (!["role_not_ready", "name_not_ready"].includes(result) || performance.now() >= deadline)
        return { version: "cmp_panel_verification.v1" as const, result, role };
      await new Promise(resolve => setTimeout(resolve, Math.min(25, Math.max(0, deadline - performance.now()))));
    }
  }, { parent: input.parent, roles: input.roles, remainingMs: input.remainingMs });
}
