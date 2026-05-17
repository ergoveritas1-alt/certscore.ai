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
