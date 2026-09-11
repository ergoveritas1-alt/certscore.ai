import { z } from "zod";

/**
 * Bounded destination classification for a consent-control link. The URL
 * itself is deliberately not retained in this contract.
 */
export const consentControlLinkDestinationSchema = z.enum([
  "same_document",
  "other_document",
  "unverified",
]);

export type ConsentControlLinkDestination = z.infer<typeof consentControlLinkDestinationSchema>;

/**
 * Classify whether an observed link stays in the current document. A
 * same-document result is reserved for a URL whose only destination change is
 * a fragment; query identity is compared exactly. Unsafe, malformed, and
 * non-web URLs remain unverified.
 */
export function classifyConsentControlLinkDestination(
  href: string | null | undefined,
  documentUrl: string | null | undefined,
): ConsentControlLinkDestination {
  const rawHref = href?.trim();
  const rawDocumentUrl = documentUrl?.trim();
  if (!rawHref || !rawDocumentUrl) return "unverified";

  try {
    const document = new URL(rawDocumentUrl);
    const target = new URL(rawHref, document);
    if (
      (document.protocol !== "http:" && document.protocol !== "https:") ||
      (target.protocol !== "http:" && target.protocol !== "https:")
    ) {
      return "unverified";
    }

    // A preference link is same-document only when it targets a fragment on
    // the exact current origin/path/query. A same-origin route is still a
    // navigation to another document for consent evidence purposes.
    if (
      target.origin === document.origin &&
      target.pathname === document.pathname &&
      target.search === document.search &&
      (Boolean(target.hash) || rawHref.endsWith("#"))
    ) {
      return "same_document";
    }
    return "other_document";
  } catch {
    return "unverified";
  }
}
