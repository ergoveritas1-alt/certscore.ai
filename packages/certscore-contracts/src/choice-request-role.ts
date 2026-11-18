import { z } from "zod";

export const choiceRequestRoleSchema = z.enum(["tag_library", "analytics", "advertising", "sanity_batch_beacon"]);
export type ChoiceRequestRole = z.infer<typeof choiceRequestRoleSchema>;

const sanityBeaconHost = "www.sanity.io";
export const choiceEndpointPaths = {
  analytics: "/g/collect",
  advertising: "/ccm/collect",
  sanity_batch_beacon: "/intake/dp/beacon/v1/batch",
} as const satisfies Record<Exclude<ChoiceRequestRole, "tag_library">, string>;

/** Request-local evidence for the consent inventory. Publisher tag IDs configure a
 * library. An event name, measurement property and client ID describe a GA4 hit. */
export function choiceRequestRole(rawUrl: string, method?: string, resourceType?: string): ChoiceRequestRole | undefined {
  if (!URL.canParse(rawUrl)) return;
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port) return;
  const type = resourceType?.toLowerCase();
  if (url.hostname === "www.googletagmanager.com" && method === "GET" && type === "script" &&
      ["/gtm.js", "/gtag/js", "/gtag/destination"].includes(url.pathname) &&
      [...url.searchParams.keys()].every(key => ["id", "cx", "gtm", "l"].includes(key))) return "tag_library";
  if (!["fetch", "xhr", "ping", "beacon"].includes(type ?? "")) return;
  if (url.hostname === sanityBeaconHost && url.pathname === choiceEndpointPaths.sanity_batch_beacon && method === "POST") return "sanity_batch_beacon";
  if (url.hostname === "pagead2.googlesyndication.com" && url.pathname === choiceEndpointPaths.advertising && method === "POST") return "advertising";
  const params = url.searchParams;
  if (url.pathname === choiceEndpointPaths.analytics && (method === "GET" || method === "POST") &&
      ["v", "tid", "en", "cid"].every(key => params.getAll(key).length === 1) && params.get("v") === "2" &&
      /^G-[A-Z0-9]+$/i.test(params.get("tid") ?? "") && /^[a-z][a-z0-9_]{0,39}$/i.test(params.get("en") ?? "") &&
      Boolean(params.get("cid"))) return "analytics";
}

export const gpcMeasurementInventorySchema = z.object({
  scanId: z.string(), graphSha256: z.string().regex(/^[a-f0-9]{64}$/), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  endpoints: z.array(z.object({
    hostname: z.string().max(253).regex(/^[a-z0-9.-]+$/), role: choiceRequestRoleSchema.exclude(["tag_library"]),
    method: z.enum(["GET", "POST"]), firstSeenMs: z.number().int().nonnegative(), count: z.number().int().positive(),
  }).refine(row => row.role !== "sanity_batch_beacon" || (row.hostname === sanityBeaconHost && row.method === "POST"))).min(1).max(8),
});
export type GpcMeasurementInventory = z.infer<typeof gpcMeasurementInventorySchema>;
