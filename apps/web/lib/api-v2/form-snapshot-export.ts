import { CANONICAL_SCAN_ID_PATTERN } from "@certscore/api-contracts";
import { SITE_URL } from "../seo";

/** Translate retained report image references into scoped API reads; never make an image available. */
export function apiFormSnapshotExport<T extends { status: string; url?: string }>(scanId: string, snapshot: T, options: { requirePage?: boolean } = {}) {
  if (snapshot.status !== "available") return snapshot;
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || SITE_URL;
  const source = new URL(snapshot.url ?? "", base);
  const endpoint = `/api/v2/scans/${scanId}/report-evidence/form-snapshot`;
  const formRef = source.searchParams.get("formRef");
  const pageId = source.searchParams.get("formPage");
  const validPath = [`/api/scans/${scanId}/form-snapshot`, `/api/scans/${scanId}/full-site`, endpoint].includes(source.pathname);
  if (!CANONICAL_SCAN_ID_PATTERN.test(scanId) || !validPath ||
    ![new URL(base).origin, new URL(SITE_URL).origin].includes(source.origin) ||
    source.searchParams.getAll("formRef").length !== 1 || !formRef ||
    !/^(?:after_accept:)?collection_form_\d+$/.test(formRef) ||
    (source.searchParams.has("formPage") && (source.searchParams.getAll("formPage").length !== 1 ||
      !pageId || !CANONICAL_SCAN_ID_PATTERN.test(pageId) || formRef.startsWith("after_accept:"))) ||
    ((source.pathname.endsWith("/full-site") || options.requirePage) && !pageId)) {
    throw new Error("Invalid retained form snapshot reference.");
  }
  const url = new URL(endpoint, base);
  if (pageId) url.searchParams.set("formPage", pageId);
  url.searchParams.set("formRef", formRef);
  return { ...snapshot, url: url.toString(), mediaType: "image/jpeg",
    retrieval: "GET this URL with the same API read bearer credential used for this report. Eligible anonymous scans require no credential. This read retrieves a retained image and does not create a scan.",
  };
}
