function getHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const POLICY_DOCUMENT_IDENTITY_VERSION = "policy_document_identity.v1";

/** A section fragment names the same fetched document. Query, scheme, port,
 * hostname aliases and path spelling require independent redirect/source proof;
 * this comparison cannot invent it. Invalid or relative identities fail closed. */
export function samePolicyDocumentUrl(left: string, right: string): boolean {
  const identity = (value: string) => {
    try {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
      url.hash = "";
      return url.href;
    } catch {
      return null;
    }
  };
  const source = identity(left);
  return source !== null && source === identity(right);
}

export function isGenericBrowserCookieHelpUrl(value: string | null | undefined) {
  const hostname = getHostname(value);
  if (!hostname) {
    return false;
  }

  const haystack = value?.toLowerCase() ?? "";
  const browserSupportHost =
    hostname === "support.microsoft.com" ||
    hostname === "support.google.com" ||
    hostname === "support.mozilla.org" ||
    hostname === "support.apple.com" ||
    hostname === "help.opera.com" ||
    hostname === "support.brave.com";

  return (
    browserSupportHost &&
    /cookie|cookies/.test(haystack) &&
    /manage|allow|block|delete|clear|enable|disable|browser|edge|chrome|firefox|safari|opera|brave|website-preferences/.test(haystack)
  );
}
