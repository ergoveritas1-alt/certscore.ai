/** A literal GA4 example is a candidate template, never a verified wildcard.
 * Keep this narrow, versioned policy separate from declaration matching. */
export function possibleCmpCookieTemplate(pattern: string, cookieName: string): boolean {
  return pattern === "_ga_xxxxxxxxxx" && /^_ga_[A-Z0-9]{10}$/.test(cookieName);
}
