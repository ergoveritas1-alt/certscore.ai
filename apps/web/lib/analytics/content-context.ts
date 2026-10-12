/** Public editorial routes only; never include scan targets, query strings or report IDs. */
export type ContentContext = { page_type: "release" | "study" | "guide" | "solution"; content_id: string; cta_location: "inline_scan" };
const CONTENT_ROUTES = { releases: "release", insights: "study", guides: "guide", solutions: "solution" } as const;
export function getContentContext(pathname: string): ContentContext | undefined {
  const match = /^\/(releases|insights|guides|solutions)\/([a-z][a-z0-9-]{0,79})$/.exec(pathname);
  if (!match) return undefined;
  return { page_type: CONTENT_ROUTES[match[1] as keyof typeof CONTENT_ROUTES], content_id: match[2]!, cta_location: "inline_scan" };
}
export function normalizeContentContext(value: unknown): ContentContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as ContentContext;
  const prefix = Object.entries(CONTENT_ROUTES).find(([, type]) => type === row.page_type)?.[0];
  if (!prefix || row.cta_location !== "inline_scan" || typeof row.content_id !== "string") return undefined;
  return getContentContext(`/${prefix}/${row.content_id}`);
}
