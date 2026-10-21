import type { CmpAuditRow } from "./cmp-audit-projection";
import { webmasterRemediation } from "./webmaster-remediation";

/** Review guidance for existing projected results, not additional findings. */
export function cmpCorrectionSteps(row: CmpAuditRow): string[] {
  if (row.status !== "Review recommended" && row.status !== "Not observed") return [];
  switch (row.id) {
    case "prominence": return [
      "Locate Accept and Reject in the same first-layer capture and inspect their source component/CMP theme. Compare placement, size, foreground/background contrast, visible text and keyboard focus at desktop and mobile widths; use the retained measurements rather than assuming color alone establishes the issue.",
      "For a confirmed visibility problem, change the CMP layout/theme so Reject is comparably discoverable and operable without an extra layer. Preserve both handlers and their distinct category decisions; publish the CMP configuration and clear caches.",
      "Retest a fresh visit in the same region using mouse and keyboard. Confirm both controls are visible, reachable and named; verify click completion, saved decision and resulting optional requests/storage separately.",
    ];
    case "implementation": {
      const plan = webmasterRemediation("refusal")!;
      return [...plan.steps, `Re-test: ${plan.verification}`];
    }
    case "found_not_declared": return [
      "Locate each unmatched cookie in DevTools Application and trace its Set-Cookie response or JavaScript writer. Confirm its provider, domain/path, purpose, expiry and consent state; do not infer purpose from the cookie name alone.",
      "Compare those facts with the CMP declaration patterns. Correct an erroneous pattern or add the verified cookie/provider/purpose/duration to the appropriate category, with privacy-owner approval; remove an unwanted integration instead of merely declaring it.",
      "Publish the CMP declaration changes, clear caches and rerun the inventory before a choice, after Reject and after Accept in separate fresh sessions. Verify each observed cookie matches an accurate entry and the category actually controls its creation/use.",
    ];
    default: return [
      `Reproduce "${row.label}" on the exact scanned URL in the scan's region using a fresh session. Use its retained controls, labels, links and source references to locate the CMP setting/template; missing evidence is not proof that a feature is absent.`,
      "Inspect the deployed CMP configuration and rendered control/link in DevTools. If the capture does not identify the element, obtain a current document-bound example from the CMP owner before choosing a setting to change; do not guess selectors or category IDs.",
      "For a confirmed defect, back up the configuration, correct the specific setting/control or link in staging and publish the reviewed CMP version. Clear caches and repeat the same criterion; record control visibility, link reachability, saved decisions and optional runtime behavior as separate checks.",
    ];
  }
}
