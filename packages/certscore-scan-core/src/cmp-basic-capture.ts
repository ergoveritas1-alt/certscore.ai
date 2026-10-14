import { cmpBasicEvidenceSchema, classifyPrivacySurface, type CmpBasicEvidence } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { Page } from "playwright";
import { readBorlabsPreferenceInventory, readPreferenceControls, classifyControls } from "./cmp-preferences-observer.js";
import { readOneTrustPreferenceInventory } from "./onetrust-preference-inventory.js";

/** Opportunistic read in the existing consent-proof visit. No action, wait,
 * navigation, retry or late join. The caller retains only a settled, loader-bound
 * result before the existing lane deadline. Partial lists never prove absence. */
export async function captureCmpBasicEvidence(input: {
  page: Page; scanId: string; targetUrl: string; scanStartedAtMs: number;
  readBinding: () => { url: string; token?: string };
  isCurrent: () => boolean;
  onOutcome?: (reason: string) => void;
}): Promise<CmpBasicEvidence | undefined> {
  const { page } = input;
  const before = input.readBinding();
  if (!before.token) { input.onOutcome?.("document_binding_missing"); return undefined; }
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  const definitions = KNOWN_CMP_REGISTRY.filter(d => d.domSelectors?.length);
  const scopes = definitions.map(d => d.preferenceInspection?.entranceSelector ?? d.domSelectors!.join(","));
  const indices = await page.locator(scopes.join(",")).evaluateAll((nodes, selectors) =>
    nodes.length > 1000 ? [] : selectors.flatMap((selector, index) => nodes.some(node => node.matches(selector)) ? [index] : []), scopes);
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  if (indices.length !== 1) { input.onOutcome?.(indices.length ? "ambiguous_registry_scopes" : "registered_scope_unavailable"); return undefined; }
  const index = indices[0]!, definition = definitions[index]!;
  const inventory = definition.preferenceInspection?.kind === "borlabs_v3" ? await readBorlabsPreferenceInventory(page)
    : definition.canonicalName === "OneTrust" ? await readOneTrustPreferenceInventory(page) : undefined;
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  const rawControls = await readPreferenceControls(page.locator(scopes[index]!));
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  // The visible CMP surface takes priority over potentially thousands of
  // unrelated page links. Classify bounded names first; hit-test only privacy links rather than every
  // link on a prolific page. Recheck the exact identity before reading geometry.
  const privacyScope = page.locator(scopes[index]!).locator("a[href]");
  const links = await privacyScope.evaluateAll(nodes => nodes.slice(0, 300).map((node, index) => ({
    index, url: (node as HTMLAnchorElement).href,
    label: (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().slice(0, 160),
  })));
  const candidates = links.filter(link => {
    const c = classifyPrivacySurface({ linkText: link.label, url: link.url });
    return link.url.length <= 2000 && /^https?:/.test(link.url) && (c.surfaceType === "privacy_policy" || c.variant === "combined_privacy_cookie_surface");
  }).slice(0, 16);
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  const privacyLinks = await privacyScope.evaluateAll((nodes, candidates) => candidates.flatMap(candidate => {
    const a = nodes[candidate.index] as HTMLAnchorElement | undefined;
    if (!a || a.href !== candidate.url || (a.getAttribute("aria-label") ?? a.textContent ?? "").trim().slice(0, 160) !== candidate.label) return [];
    const hitTargetBeforeAction = [...a.getClientRects()].slice(0, 3).some(box => {
      const left = Math.max(0, box.left), right = Math.min(innerWidth, box.right), top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
      if (right <= left || bottom <= top || getComputedStyle(a).visibility !== "visible") return false;
      return [[.5, .5], [.25, .25], [.75, .75]].some(([x, y]) => {
        let hit = document.elementFromPoint(left + (right - left) * x!, top + (bottom - top) * y!);
        for (let depth = 0; hit?.shadowRoot && depth < 8; depth++) { const inner = hit.shadowRoot.elementFromPoint(left + (right - left) * x!, top + (bottom - top) * y!); if (!inner || inner === hit) break; hit = inner; }
        return Boolean(hit && (a === hit || a.contains(hit)));
      });
    });
    return [{ url: candidate.url, hitTargetBeforeAction }];
  }), candidates);
  const after = input.readBinding();
  if (!input.isCurrent()) { input.onOutcome?.("capture_slice_exhausted"); return undefined; }
  if (before.url !== after.url || before.token !== after.token) { input.onOutcome?.("document_changed"); return undefined; }
  input.onOutcome?.("captured");
  return cmpBasicEvidenceSchema.parse({
    contractVersion: "certscore.cmp-basic-evidence.v1", sourceLane: "consent_proof", scanId: input.scanId,
    targetUrl: input.targetUrl, documentUrl: before.url, documentToken: before.token,
    capturedAtMs: Date.now() - input.scanStartedAtMs, provider: definition.canonicalName,
    controls: classifyControls(rawControls.controls, inventory), privacyLinks,
    declarations: inventory?.declarations ?? [], serviceNames: (inventory?.services ?? []).filter(Boolean),
    serviceDisclosures: inventory && "serviceDisclosures" in inventory ? inventory.serviceDisclosures : undefined,
    limitations: ["passive_first_layer_only", "declaration_inventory_not_complete", ...(rawControls.overflow ? ["control_inventory_overflow"] : [])],
  });
}
