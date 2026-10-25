import { z } from "zod";
import { technologyInventorySchema } from "./technology-inventory";
import { cmsVersionEvidenceSchema, WORDPRESS_RELEASE } from "./cms-version-evidence";
import { CMS_CATALOGUE_VERSION, CMS_CATALOGUE_V1, CMS_CATALOGUE_V2, CMS_CATALOGUE_V3, CMS_CATALOGUE_REVIEWED_AT, CMS_CATALOGUE_LEGACY_REVIEWED_AT, CMS_SECURITY_RULES, CMS_SECURITY_RULES_V1, CMS_SECURITY_RULES_V2, type CmsProduct, type CmsRange } from "./cms-security-catalog";
export { CMS_CATALOGUE_VERSION, CMS_CATALOGUE_REVIEWED_AT, CMS_SECURITY_RULES } from "./cms-security-catalog";
export const CMS_SECURITY_FINDING_ID = "site_integrity_cms_security";
export const CMS_SECURITY_SIGNAL = "site_integrity.cms_security";
export const CMS_NAMES: Record<CmsProduct, string> = { wordpress: "WordPress", joomla: "Joomla", drupal: "Drupal", magento: "Magento", "adobe-commerce": "Adobe Commerce", prestashop: "PrestaShop", typo3: "TYPO3", opencart: "OpenCart", shopify: "Shopify", wix: "Wix", squarespace: "Squarespace" };
export const CMS_ASSET_PATTERNS: Partial<Record<CmsProduct, string>> = {
  wordpress: "^/(?:wp-content|wp-includes)/",
  joomla: "^/media/system/js/(?:joomla|core)(?:[.-]|/)",
  drupal: "^/(?:core/misc/drupal|misc/drupal)(?:[.-]|/)",
  magento: "^/static/(?:version[0-9]+/)?frontend/[^/]+/[^/]+/[^/]+/Magento_[^/]+/",
  prestashop: "^/(?:js|themes/[^/]+/assets/js)/prestashop(?:[.-]|/)",
  typo3: "^/(?:typo3/sysext|typo3conf/ext|typo3temp/assets)/",
  opencart: "^/catalog/view/(?:javascript|theme/[^/]+/javascript)/common\\.js$",
};
const publicUrl = z.string().url().max(2048).refine(value => { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password && !u.search && !u.hash; });
export function cmsSafeUrl(value: string): string | null {
  try { const u = new URL(value); if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null; u.search = ""; u.hash = ""; return u.href.length <= 2048 ? u.href : null; } catch { return null; }
}
export const cmsSignalSchema = z.object({
  evidenceRef: z.string().regex(/^site_integrity:(?:dom|asset|version):\d+$/),
  kind: z.enum(["meta_generator", "asset_path", "html_generator_comment", "core_asset_version", "feed_generator"]), versionEvidence: cmsVersionEvidenceSchema.optional(), value: z.string().min(1).max(512),
  sourceUrl: publicUrl, artifactRef: z.string().min(1).max(256),
}).strict();
export type CmsSignal = z.infer<typeof cmsSignalSchema>;
/** Numeric releases only: no coercion of partial, prerelease, ELTS or vendor suffixes. */
export function compareCmsVersions(left: string, right: string): number | null {
  const parse = (value: string) => {
    const match = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:\.(0|[1-9]\d{0,5}))?(?:-p(0|[1-9]\d{0,5}))?$/.exec(value);
    if (!match || (match[4] && match[5])) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0)];
  };
  const a = parse(left), b = parse(right); if (!a || !b) return null;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return 0;
}
export function matchesCmsRange(version: string, range: CmsRange) {
  const low = compareCmsVersions(version, range.min), high = compareCmsVersions(version, range.max);
  return low !== null && high !== null && low >= 0 && (range.maxInclusive ? high <= 0 : high < 0);
}
export function cmsRangeLabel(range: CmsRange) { return `>= ${range.min} ${range.maxInclusive ? "<=" : "<"} ${range.max}`; }
const hosted = new Set<CmsProduct>(["shopify", "wix", "squarespace"]);
function identify(signal: CmsSignal) {
  if (signal.versionEvidence) return [{ product: "wordpress" as const, observedVersion: signal.versionEvidence.version }];
  return (Object.keys(CMS_NAMES) as CmsProduct[]).flatMap(product => {
    if (signal.kind === "asset_path") {
      const pattern = CMS_ASSET_PATTERNS[product];
      return pattern && new RegExp(pattern, "i").test(signal.value) ? [{ product, observedVersion: null as string | null }] : [];
    }
    const name = product === "adobe-commerce" ? "Adobe Commerce" : CMS_NAMES[product];
    const match = new RegExp(`^${name}(?:!| CMS)?(?=$|[\\s/.])(?:[\\s/]+(?:v(?:ersion)?\\s*)?([0-9][0-9A-Za-z.+_-]*))?`, "i").exec(signal.value);
    return match ? [{ product, observedVersion: match[1] ?? null }] : [];
  });
}
export function assessCmsSignals(signals: CmsSignal[], assessedAt: string, catalogueVersion: typeof CMS_CATALOGUE_VERSION | typeof CMS_CATALOGUE_V1 | typeof CMS_CATALOGUE_V2 | typeof CMS_CATALOGUE_V3 = CMS_CATALOGUE_VERSION, evidencePolicy: "v1" | "v2" = "v1") {
  const rules = catalogueVersion === CMS_CATALOGUE_V1 ? CMS_SECURITY_RULES_V1 : catalogueVersion === CMS_CATALOGUE_V2 ? CMS_SECURITY_RULES_V2 : CMS_SECURITY_RULES;
  const currentCatalogue = catalogueVersion === CMS_CATALOGUE_VERSION;
  const catalogueReviewedAt = currentCatalogue || catalogueVersion === CMS_CATALOGUE_V3 ? CMS_CATALOGUE_REVIEWED_AT : CMS_CATALOGUE_LEGACY_REVIEWED_AT;
  // Drupal 7 core uses complete two-component releases (7.98), not semver.
  // This grammar starts at v3; historical conclusions are reproduced unchanged.
  const drupal7Release = (product: CmsProduct, value: string) => (currentCatalogue || catalogueVersion === CMS_CATALOGUE_V3) && product === "drupal" && /^7\.(?:0|[1-9]\d{0,5})$/.test(value);
  const comparable = (product: CmsProduct, value: string) => drupal7Release(product, value) || evidencePolicy === "v2" && product === "wordpress" && WORDPRESS_RELEASE.test(value) && value.split(".").length === 2 ? `${value}.0` : value;
  // A complete major interval may prove community lifecycle only, never a release/CVE.
  const branchRange = (product: CmsProduct, major: string, rule: typeof rules[number]) => {
    if (rule.kind !== "lifecycle" || !rule.products.includes(product) || rule.effectiveAt > assessedAt.slice(0, 10)) return undefined;
    const lower = `${major}.0.0`, upper = `${Number(major) + 1}.0.0`;
    return rule.ranges.find(range => {
      const low = compareCmsVersions(lower, range.min), high = compareCmsVersions(upper, range.max);
      return low !== null && high !== null && low >= 0 && high <= 0;
    });
  };
  const candidates = signals.flatMap(signal => identify(signal).map(detection => ({ ...detection, signal })));
  const products = [...new Set(candidates.map(row => row.product))];
  const detections = products.map((product, index) => {
    const rows = candidates.filter(row => row.product === product);
    const declarations = rows.filter(row => row.signal.kind === "meta_generator" || evidencePolicy === "v2" && ["html_generator_comment", "feed_generator"].includes(row.signal.kind));
    const versionRows = evidencePolicy === "v2" && !declarations.some(row => row.observedVersion) ? rows.filter(row => row.signal.kind === "core_asset_version") : declarations;
    const observedVersions = [...new Set(versionRows.map(row => row.observedVersion).filter((v): v is string => v !== null))];
    const candidate = observedVersions.length === 1 ? observedVersions[0]! : null;
    const comparableVersion = candidate ? comparable(product, candidate) : null;
    const exact = candidate && comparableVersion && compareCmsVersions(comparableVersion, comparableVersion) === 0 &&
      (!candidate.includes("-p") || ["magento", "adobe-commerce"].includes(product)) &&
      ((currentCatalogue || catalogueVersion === CMS_CATALOGUE_V3) && product === "drupal" && /^7(?:\.|$)/.test(candidate) ? drupal7Release(product, candidate) : product === "opencart" ? /^\d+\.\d+\.\d+\.\d+$/.test(candidate) : product === "prestashop" ? /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(candidate) : product === "wordpress" && evidencePolicy === "v2" ? WORDPRESS_RELEASE.test(candidate) : /^\d+\.\d+\.\d+(?:-p\d+)?$/.test(candidate));
    // A page declaring multiple CMS products is ambiguous; do not guess which owns a version.
    const version = exact && products.length === 1 && (evidencePolicy === "v2" ? declarations.filter(row => row.observedVersion !== null) : declarations).every(row => row.observedVersion === candidate) && declarations.some(row => row.observedVersion === candidate) ? candidate : null;
    const branchVersion = currentCatalogue && candidate && /^(?:0|[1-9]\d{0,5})$/.test(candidate) && products.length === 1 &&
      declarations.length > 0 && declarations.every(row => row.observedVersion === candidate &&
        new RegExp(`^${CMS_NAMES[product]}(?:!| CMS)?[\\s/]+(?:v(?:ersion)?\\s*)?${candidate}${product === "drupal" ? "(?: \\(https?://(?:www\\.)?drupal\\.org/?\\))?" : ""}$`, "i").test(row.signal.value)) &&
      rules.some(rule => branchRange(product, candidate, rule)) ? candidate : null;
    return { ...(branchVersion ? { branchVersion, versionGranularity: "declared_branch" as const } : {}), evidenceRef: `site_integrity:cms:${index}`, product, name: CMS_NAMES[product],
      observedVersions, version, versionBasis: versionRows.some(row => row.signal.kind === "core_asset_version") ? "inferred" as const : declarations.length ? "declared" as const : "inferred" as const,
      confidence: versionRows.some(row => row.signal.kind === "core_asset_version") ? "medium" as const : declarations.length ? "high" as const : "medium" as const,
      runtimeVersionConfirmed: false as const, informationalOnly: hosted.has(product),
      evidenceRefs: rows.map(row => row.signal.evidenceRef),
      versionStatus: hosted.has(product) ? "hosted_service" : version ? "declared_exact" : branchVersion ? "declared_branch" : observedVersions.length > 1 || products.length > 1 ? "conflicting" : "unknown_or_partial",
    };
  });
  let vulnIndex = 0, lifecycleIndex = 0;
  const matches = detections.flatMap(detection => {
    if ((!detection.version && !detection.branchVersion) || detection.informationalOnly) return [];
    const retainedVersion = detection.version ?? detection.branchVersion!;
    return rules.flatMap(rule => {
      if (!rule.products.includes(detection.product) || rule.effectiveAt > assessedAt.slice(0, 10)) return [];
      const comparableVersion = comparable(detection.product, retainedVersion);
      const range = detection.branchVersion ? branchRange(detection.product, detection.branchVersion, rule) : rule.ranges.find(range => matchesCmsRange(comparableVersion, range));
      if (!range) return [];
      return [{ evidenceRef: `site_integrity:${rule.kind === "vulnerability" ? `vuln:${vulnIndex++}` : `lifecycle:${lifecycleIndex++}`}`,
        detectionRef: detection.evidenceRef, observedVersion: retainedVersion, confidence: detection.confidence,
        affectedVersionMatch: true as const, matchedRange: cmsRangeLabel(range), record: rule }];
    });
  });
  return { catalogueVersion, catalogueReviewedAt, detections, matches };
}
export type CmsAssessment = ReturnType<typeof assessCmsSignals>;
/** Informational inventory from retained declarations/paths; never core versions or advisory inputs. */
const wordpressPlugins = [
  { id: "sitepress-multilingual-cms", name: "WPML", generator: /^WPML(?:\s+ver:([0-9]+(?:\.[0-9]+){1,3}))?(?=\s|$)/i },
  { id: "wp-rocket", name: "WP Rocket", generator: /^WP Rocket(?:\s+([0-9]+(?:\.[0-9]+){1,3}))?\s*$/i },
  { id: "js_composer", name: "WPBakery Page Builder", generator: /^Powered by WPBakery Page Builder - drag and drop page builder for WordPress\.?$/i },
  { id: "borlabs-cookie", name: "Borlabs Cookie" },
  { id: "svg-support", name: "SVG Support" },
] as const;
const cmsPluginDetectionSchema = z.object({
  evidenceRef: z.string().regex(/^site_integrity:plugin:\d+$/),
  id: z.string().regex(/^[a-z0-9_-]{1,80}$/), name: z.string().min(1).max(80),
  version: z.string().regex(/^[0-9]+(?:\.[0-9]+){1,3}$/).nullable(),
  observedVersions: z.array(z.string().regex(/^[0-9]+(?:\.[0-9]+){1,3}$/)).max(8),
  versionStatus: z.enum(["declared", "not_detected", "conflicting"]),
  evidenceRefs: z.array(z.string().regex(/^site_integrity:(?:dom|asset):\d+$/)).min(1).max(14),
}).strict();
export const cmsPluginInventorySchema = z.object({
  contractVersion: z.literal("certscore.cms-plugin-inventory.v1"),
  detections: z.array(cmsPluginDetectionSchema).max(14),
}).strict();
export type CmsPluginInventory = z.infer<typeof cmsPluginInventorySchema>;
export function assessCmsPluginSignals(signals: CmsSignal[]): CmsPluginInventory {
  const candidates = signals.flatMap<{ id: string; name: string; version: string | null; evidenceRef: string }>(signal => {
    if (signal.kind === "meta_generator") return wordpressPlugins.flatMap(plugin => {
      const match = "generator" in plugin ? plugin.generator.exec(signal.value) : null;
      return match ? [{ id: plugin.id as string, name: plugin.name as string, version: match[1] ?? null, evidenceRef: signal.evidenceRef }] : [];
    });
    if (signal.kind !== "asset_path") return [];
    // A retained same-site plugin directory identifies an asset, not an installed/core version.
    const id = /\/wp-content\/plugins\/([a-z0-9_-]{1,80})\//i.exec(signal.value)?.[1]?.toLowerCase();
    if (!id) return [];
    const plugin = wordpressPlugins.find(row => row.id === id);
    return [{ id, name: plugin?.name ?? id, version: null, evidenceRef: signal.evidenceRef }];
  });
  const ids = [...new Set(candidates.map(row => row.id))];
  return { contractVersion: "certscore.cms-plugin-inventory.v1", detections: ids.map((id, index) => {
    const rows = candidates.filter(row => row.id === id);
    const observedVersions = [...new Set(rows.flatMap(row => row.version ? [row.version] : []))];
    return { evidenceRef: `site_integrity:plugin:${index}`, id, name: rows[0]!.name,
      version: observedVersions.length === 1 ? observedVersions[0]! : null, observedVersions,
      versionStatus: observedVersions.length === 1 ? "declared" : observedVersions.length > 1 ? "conflicting" : "not_detected",
      evidenceRefs: rows.map(row => row.evidenceRef),
    };
  }) };
}
const projectionBase = z.object({
  contractVersion: z.enum(["certscore.cms-security-projection.v1", "certscore.cms-security-projection.v2"]), scanId: z.string().min(1),
  verificationStatus: z.literal("verified"), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  documentUrl: publicUrl, documentToken: z.string().min(1), capturedAt: z.string().datetime(),
  evidenceRef: z.string().min(1).max(256), signals: z.array(cmsSignalSchema).max(22),
  assessment: z.custom<CmsAssessment>(),
  pluginInventory: cmsPluginInventorySchema.optional(),
  technologyInventory: technologyInventorySchema.optional(),
}).strict();
// JSONB may reorder object keys. Compare the bounded expected shape, not serialization order.
function sameAssessment(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return actual === expected;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((row, index) => sameAssessment(actual[index], row));
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every(key => sameAssessment((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]));
}
export const cmsSecurityProjectionSchema = projectionBase.superRefine((value, ctx) => {
  const version = value.assessment?.catalogueVersion;
  if (version !== CMS_CATALOGUE_VERSION && version !== CMS_CATALOGUE_V1 && version !== CMS_CATALOGUE_V2 && version !== CMS_CATALOGUE_V3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unknown CMS catalogue version" });
    return;
  }
  const policy = value.contractVersion === "certscore.cms-security-projection.v2" ? "v2" : "v1";
  if (policy === "v1" && (value.signals.length > 14 || value.signals.some(row => row.versionEvidence || !["meta_generator", "asset_path"].includes(row.kind)))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Historical CMS projections cannot acquire new version evidence" });
  }
  const expected = assessCmsSignals(value.signals, value.capturedAt, version, policy);
  if (!sameAssessment(value.assessment, expected)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CMS assessment must reproduce the versioned catalogue match" });
  if (value.pluginInventory && !sameAssessment(value.pluginInventory, assessCmsPluginSignals(value.signals)))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CMS plugin inventory must reproduce retained declarations and paths" });
  const refs = value.signals.map(row => row.evidenceRef);
  const documentOrigin = new URL(value.documentUrl).origin;
  if (value.technologyInventory && value.technologyInventory.documentUrl !== value.documentUrl)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Technology inventory must belong to the CMS evidence document" });
  const invalidSignal = value.signals.some(row => {
    if (row.kind === "meta_generator") return row.versionEvidence !== undefined || row.sourceUrl !== value.documentUrl || !row.evidenceRef.startsWith("site_integrity:dom:");
    if (row.kind === "asset_path") return row.versionEvidence !== undefined || new URL(row.sourceUrl).origin !== documentOrigin || new URL(row.sourceUrl).pathname !== row.value || !row.evidenceRef.startsWith("site_integrity:asset:");
    const proof = row.versionEvidence;
    return !proof || proof.kind !== row.kind || proof.value !== row.value || proof.sourceUrl !== row.sourceUrl || new URL(row.sourceUrl).origin !== documentOrigin ||
      !row.evidenceRef.startsWith("site_integrity:version:") || row.kind === "html_generator_comment" && row.sourceUrl !== value.documentUrl ||
      proof.kind === "feed_generator" && proof.linkedFrom !== value.documentUrl;
  });
  if (new Set(refs).size !== refs.length || invalidSignal)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CMS evidence references must be unique and document-bound" });
});
export type CmsSecurityProjection = z.infer<typeof cmsSecurityProjectionSchema>;
export function qualifiesCmsSecurityReview(value: unknown) {
  const parsed = cmsSecurityProjectionSchema.safeParse(value);
  return parsed.success && parsed.data.assessment.matches.length > 0;
}
export function cmsSecurityCopy(projection: CmsSecurityProjection) {
  const matches = projection.assessment.matches;
  const vulnerabilities = matches.filter(row => row.record.kind === "vulnerability");
  const title = vulnerabilities.length ? "Potential CMS vulnerability" : "Unsupported CMS branch";
  const description = matches.map(row => `${projection.assessment.detections.find(d => d.evidenceRef === row.detectionRef)?.name} declares ${row.observedVersion}: ${row.record.kind === "lifecycle" ? row.record.title : row.record.id} (${row.matchedRange}).`).join(" ") + " The version is declared, not runtime-confirmed; verify the installed release and any backported fixes.";
  return { title, description, severity: matches.some(row => row.record.severity === "high") ? "high" as const : "medium" as const,
    action: "Confirm the installed CMS version and patch status with the site administrator, then update affected releases using the linked vendor guidance." };
}
/** All references are scoped to this scan/document and resolve to retained values or catalogue records. */
export function resolveCmsEvidence(projection: CmsSecurityProjection, reference: string) {
  return projection.signals.find(row => row.evidenceRef === reference) ?? projection.assessment.detections.find(row => row.evidenceRef === reference) ?? projection.assessment.matches.find(row => row.evidenceRef === reference) ?? projection.pluginInventory?.detections.find(row => row.evidenceRef === reference) ?? projection.technologyInventory?.signals.find(row => row.evidenceRef === reference) ?? null;
}
