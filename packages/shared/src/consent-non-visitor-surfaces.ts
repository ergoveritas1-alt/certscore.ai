/** Positive document-bound exclusions for captured product demos. A provider
 * name, an iframe alone, or a marker on the main page is never sufficient.
 * This filters consent candidates only; runtime/network evidence is retained. */
export const CONSENT_NON_VISITOR_SURFACE_POLICY = "consent_non_visitor_surface.v1" as const;
export const CONSENT_NON_VISITOR_SURFACES = [{
  version: CONSENT_NON_VISITOR_SURFACE_POLICY,
  origin: "https://capture.navattic.com",
  selector: "#nv-powered-by-navattic, html:has(#nv-powered-by-navattic) [role='dialog'][aria-label^='Step '], html:has(consent-notices-didomi-skeleton[nv_id]) [id^='single-spa-application:@didomi-spa/'][nv_id], consent-notices-didomi-skeleton[nv_id]",
}] as const;

/** Self-contained so the same predicate can run in bounded browser collectors. */
export function isNonVisitorConsentSurface(element: Element, rules: readonly { origin: string; selector: string }[]): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || view === view.top) return false;
  for (const rule of rules) {
    if (view.location.origin === rule.origin && element.closest(rule.selector)) return true;
  }
  return false;
}
