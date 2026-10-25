/** Positive-only, source-specific policy provenance. This is neither a general
 * ownership relationship nor a navigation/action authorization. */
export const JOYBUY_OPT_OUT_POLICY_REDIRECT = {
  id: "joybuy_uk_cookie_choices.v1",
  targetUrl: "https://joybuy.com/",
  pageUrl: "https://www.joybuy.com/country-selection",
  requestedUrl: "https://www.joybuy.com/help/cookie-policy",
  finalUrl: "https://www.joybuy.co.uk/help/cookie-policy",
  verifiedFrom: "2026-10-24T00:00:00.000Z",
} as const;

export function reviewedOptOutPolicyRedirect(pageUrl: string, chain: readonly string[], observedAt: string) {
  const rule = JOYBUY_OPT_OUT_POLICY_REDIRECT;
  const at = Date.parse(observedAt);
  return pageUrl === rule.pageUrl && chain.length === 2 && chain[0] === rule.requestedUrl && chain[1] === rule.finalUrl &&
    Number.isFinite(at) && at >= Date.parse(rule.verifiedFrom) ? rule : undefined;
}
