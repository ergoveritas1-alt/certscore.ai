import { z } from "zod";

/** Descriptive, document-bound metadata; never a finding or a score input. */
export const siteMetadataSchema = z.object({
  contractVersion: z.literal("certscore.site-metadata.v1"),
  title: z.string().max(240),
  language: z.string().max(35),
  generators: z.array(z.string().max(160)).max(8),
  wordpressAssetObserved: z.boolean(),
});
export type SiteMetadata = z.infer<typeof siteMetadataSchema>;
export const siteMetadataProjectionSchema = z.object({
  contractVersion: z.literal("certscore.site-metadata-projection.v1"),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  documentUrl: z.string().url(),
  evidenceRef: z.string(),
  capturedAtMs: z.number().nonnegative(),
  observation: siteMetadataSchema,
});
export type SiteMetadataProjection = z.infer<typeof siteMetadataProjectionSchema>;

export function describeSiteTechnology(observation?: SiteMetadata | null) {
  if (!observation) return { platform: "Not captured", version: "Unknown" };
  const wordpress = observation.generators.map(value => /^WordPress(?:\s+([0-9]+(?:\.[0-9]+){1,3}))?\s*$/i.exec(value)).filter(Boolean);
  if (wordpress.length) {
    const versions = [...new Set(wordpress.map(match => match?.[1]).filter(Boolean))];
    return { platform: "WordPress (declared)", version: versions.length === 1 ? versions[0]! : "Unknown" };
  }
  if (observation.wordpressAssetObserved) return { platform: "WordPress indicators observed", version: "Unknown" };
  // Read explicit generator declarations only; asset versions can belong to plugins.
  const cmsNames = ["Hugo", "Drupal", "Joomla", "Ghost", "Shopify", "Wix", "Squarespace", "Webflow", "TYPO3", "Magento", "PrestaShop", "HubSpot", "Contentful"];
  const detected = cmsNames.flatMap(name => {
    const declarations = observation.generators.filter(value => new RegExp(`^${name}(?:\\b|!)`, "i").test(value));
    if (!declarations.length) return [];
    const versions = declarations.map(value => new RegExp(`^${name}[!]?\\s+(?:v(?:ersion)?\\s*)?([0-9]+(?:\\.[0-9]+){1,3})(?=\\s|$|[,;])`, "i").exec(value)?.[1]);
    const unique = [...new Set(versions.filter(Boolean))];
    return [{ platform: `${name} (declared)`, version: unique.length === 1 && versions.every(Boolean) ? unique[0]! : "Unknown" }];
  });
  if (detected.length === 1) return detected[0]!;
  if (detected.length > 1) return { platform: detected.map(item => item.platform).join(", "), version: "Unknown" };
  return { platform: observation.generators.join(", ") || "Not identified", version: "Unknown" };
}
