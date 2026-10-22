import { z } from "zod";
import { vendorRegistryAttributionSchema } from "./vendor-registry-attribution";

export const COOKIE_CLASSIFICATION_VERSION = "certscore.cookie-purpose.v6" as const;
export const cookiePurposeCategorySchema = z.enum([
  "advertising", "analytics", "consent_management", "infrastructure", "marketing",
  "personalization", "security", "session_replay", "tag_management", "unknown",
]);

/** Technical classification of an exact observation, not a consent/legal determination. */
export const cookieClassificationSchema = z.object({
  version: z.enum(["certscore.cookie-purpose.v3", "certscore.cookie-purpose.v4", "certscore.cookie-purpose.v5", COOKIE_CLASSIFICATION_VERSION]),
  cookieName: z.string().max(4096),
  cookieDomain: z.string().max(253).nullable(),
  category: cookiePurposeCategorySchema,
  essentiality: z.enum(["essential", "non_essential", "unknown"]),
  documentedPurposes: z.array(cookiePurposeCategorySchema).max(10),
  ruleId: z.string().max(160),
  provider: z.object({
    vendor: z.string().max(160),
    product: z.string().max(160),
    entity: z.string().max(160),
    registryAttribution: vendorRegistryAttributionSchema,
  }).strict().nullable(),
}).strict();
export type CookieClassification = z.infer<typeof cookieClassificationSchema>;

/** Invalid or mismatched new evidence must never fall back to legacy name heuristics. */
export function readCookieClassification(value: unknown, name: string, domain: string | null | undefined) {
  const result = cookieClassificationSchema.safeParse(value);
  const normalizedDomain = domain?.replace(/^\.+/, "").toLowerCase() || null;
  return result.success && result.data.cookieName === name && result.data.cookieDomain === normalizedDomain
    ? result.data : null;
}
