import type { Locator } from "playwright";
import { classifyConsentControlLabel } from "@certscore/contracts";
import type { KnownCmpDefinition } from "@website-signal-risk-scanner/shared";

export type SaleSharingSettingsEntrance = NonNullable<NonNullable<KnownCmpDefinition["saleSharingOptOut"]>["settingsEntrances"]>[number];

/** A Settings observation alone never grants action authority. The caller must
 * first bind this reviewed entrance to its exact original route and destination.
 * Keep plural Cookies Settings observation-only in the global classifier. */
export async function safeSaleSharingSettingsEntrance(
  control: Locator, recipe: SaleSharingSettingsEntrance, timeoutMs: number,
): Promise<boolean> {
  if (await control.count() !== 1 || !await control.isVisible() || !await control.isEnabled({ timeout: timeoutMs })) return false;
  const names = await control.evaluate((node, expected) => {
    const el = node as HTMLElement;
    if (el.getRootNode() !== document || el.closest("form") || el.hasAttribute("form") || el.getAttribute("type") === "submit") return null;
    if (el.tagName === "A") {
      if (!expected.anchorSelector || !el.matches(expected.anchorSelector) ||
        el.getAttribute("href") !== "#" || el.hasAttribute("target") || el.hasAttribute("download") ||
        new URL((el as HTMLAnchorElement).href).href !== `${expected.actionTargetUrl}#`) return null;
    } else if (el.tagName !== "BUTTON" || !el.matches(expected.buttonSelector)) return null;
    const labelledBy = el.getAttribute("aria-labelledby")?.trim();
    let label: string;
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/);
      if (ids.length > 4 || ids.some(id => document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length !== 1)) return null;
      label = ids.map(id => document.getElementById(id)!.textContent ?? "").join(" ");
    } else label = el.getAttribute("aria-label") || el.innerText;
    const visible = el.innerText;
    if (!label || label.length > 300 || visible.length > 300) return null;
    return { label, visible };
  }, recipe);
  if (!names) return false;
  return [names.label, ...(names.visible.trim() ? [names.visible] : [])].every(label => {
    const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");
    const classified = classifyConsentControlLabel({ label, usage: "observation", hasConsentContext: true, hasPreferenceContext: true });
    return recipe.labels.includes(normalized) && classified.intent === "options" && classified.matchStrength === "direct";
  });
}
