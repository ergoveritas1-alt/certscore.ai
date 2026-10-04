/** Public editorial routes only; never include scan targets, query strings or report IDs. */
export type ContentContext = { page_type: "release" | "study"; content_id: string; cta_location: "inline_scan" };
export function getContentContext(pathname: string): ContentContext | undefined {
  const match = /^\/(releases|insights)\/([a-z][a-z0-9-]{0,79})$/.exec(pathname);
  if (!match) return undefined;
  return { page_type: match[1] === "releases" ? "release" : "study", content_id: match[2]!, cta_location: "inline_scan" };
}
export function normalizeContentContext(value: unknown): ContentContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as ContentContext;
  if (!["release", "study"].includes(row.page_type) || row.cta_location !== "inline_scan" || typeof row.content_id !== "string") return undefined;
  return getContentContext(`/${row.page_type === "release" ? "releases" : "insights"}/${row.content_id}`);
}
