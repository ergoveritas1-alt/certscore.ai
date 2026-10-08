import { z } from "zod";
import { cmsVersionEvidenceSchema } from "./cms-version-evidence";

/** Document-bound observations; findings require the verified canonical CMS projection. */
const siteMetadataBaseSchema = z.object({
  contractVersion: z.literal("certscore.site-metadata.v1"),
  title: z.string().max(240),
  language: z.string().max(35),
  generators: z.array(z.string().max(160)).max(8),
  wordpressAssetObserved: z.boolean(),
  /** Same-origin CMS-specific asset URLs; queries/fragments omitted, never version evidence. */
  cmsAssets: z.array(z.string().url().max(512)).max(6).optional(),
  versionEvidence: z.array(cmsVersionEvidenceSchema).max(8).optional(),
  feedLinks: z.array(z.string().url().max(512)).max(1).optional(),
});
export type SiteMetadata = z.infer<typeof siteMetadataBaseSchema>;
// Keep bundle declarations bounded without changing runtime validation.
export const siteMetadataSchema: z.ZodType<SiteMetadata, z.ZodTypeDef, unknown> = siteMetadataBaseSchema;
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
  const declaredHints = (observation.versionEvidence ?? []).filter(row => row.kind !== "core_asset_version");
  if (wordpress.length || declaredHints.length) {
    const versions = [...new Set([...wordpress.map(match => match?.[1]).filter((version): version is string => Boolean(version)), ...declaredHints.map(row => row.version)])];
    return { platform: "WordPress (declared)", version: versions.length === 1 ? versions[0]! : "Unknown" };
  }
  const assetVersions = [...new Set((observation.versionEvidence ?? []).filter(row => row.kind === "core_asset_version").map(row => row.version))];
  if (observation.wordpressAssetObserved || assetVersions.length) return { platform: "WordPress indicators observed", version: assetVersions.length === 1 ? `${assetVersions[0]} (asset)` : "Unknown" };
  // Read explicit generator declarations only; asset versions can belong to plugins.
  const cmsNames = ["Hugo", "Drupal", "Joomla", "Ghost", "Shopify", "Wix", "Squarespace", "Webflow", "TYPO3", "Magento", "Adobe Commerce", "OpenCart", "PrestaShop", "HubSpot", "Contentful"];
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
