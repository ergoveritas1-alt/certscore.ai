import { z } from "zod";

/** Supplemental identities only. The eleven existing CMS identities remain in cms-security. */
export const TECHNOLOGY_RULESET = "certscore.technology-rules.v1" as const;
export const TECHNOLOGY_INVENTORY_MAX_BYTES = 4096;
export const TECHNOLOGY_CAPTURE_MAX_BYTES = 1024;
export const TECHNOLOGY_NAMES = {
  ghost: "Ghost", hugo: "Hugo", webflow: "Webflow", hubspot: "HubSpot", contentful: "Contentful",
  woocommerce: "WooCommerce", nextjs: "Next.js", react: "React", vue: "Vue", nuxt: "Nuxt",
  nginx: "nginx", apache: "Apache HTTP Server", iis: "Microsoft IIS", php: "PHP",
  cloudflare: "Cloudflare", cloudfront: "CloudFront", fastly: "Fastly", akamai: "Akamai",
} as const;
export type TechnologyId = keyof typeof TECHNOLOGY_NAMES;
const ids = Object.keys(TECHNOLOGY_NAMES) as [TechnologyId, ...TechnologyId[]];
const safeUrl = z.string().url().max(512).refine(value => {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password && !u.search && !u.hash;
  } catch { return false; }
});
export const technologyObservationSchema = z.object({
  kind: z.enum(["generator", "asset", "marker", "header"]),
  value: z.string().min(1).max(256),
  // Assets keep their actual origin; remote assets never establish the page platform.
  sourceUrl: safeUrl.optional(),
}).strict();
export type TechnologyObservation = z.infer<typeof technologyObservationSchema>;
export const technologyCaptureSchema = z.object({
  version: z.literal("certscore.technology-capture.v1"),
  observations: z.array(technologyObservationSchema).max(8),
  responseRequestId: z.string().min(1).max(160).optional(),
  responseDocumentToken: z.string().min(1).max(160).optional(),
  truncated: z.boolean(),
}).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= TECHNOLOGY_CAPTURE_MAX_BYTES &&
  (!value.observations.some(row => row.kind === "header") || Boolean(value.responseRequestId && value.responseDocumentToken)));
export type TechnologyCapture = z.infer<typeof technologyCaptureSchema>;
const signalSchema = technologyObservationSchema.extend({
  evidenceRef: z.string().regex(/^site_integrity:tech-signal:\d+$/),
  sourceRef: z.string().min(1).max(256),
  sourceUrl: safeUrl,
}).strict();
export type TechnologySignal = z.infer<typeof signalSchema>;
const scopeSchema = z.enum(["page_platform", "page_component", "external_asset", "delivery"]);
export const TECHNOLOGY_SCOPE_LABELS: Record<z.infer<typeof scopeSchema>, string> = {
  page_platform: "Page platform", page_component: "Page component",
  external_asset: "External asset · ownership unresolved", delivery: "Delivery infrastructure",
};
const categorySchema = z.enum(["cms", "commerce", "framework", "server", "runtime", "cdn"]);
export const TECHNOLOGY_CATEGORY_LABELS: Record<z.infer<typeof categorySchema>, string> = {
  cms: "CMS / builder", commerce: "Commerce", framework: "Framework / library", server: "Web server", runtime: "Backend runtime", cdn: "CDN / delivery",
};
const detectionSchema = z.object({
  id: z.enum(ids), category: categorySchema, scope: scopeSchema,
  confidence: z.enum(["high", "tentative"]), version: z.string().max(40).nullable(),
  versionStatus: z.enum(["declared", "not_detected", "conflicting"]),
  observedVersions: z.array(z.string().max(40)).max(8),
  ruleIds: z.array(z.string().max(80)).max(8), evidenceRefs: z.array(z.string().max(80)).min(1).max(16),
}).strict();
export type TechnologyDetection = z.infer<typeof detectionSchema>;
type Match = Omit<TechnologyDetection, "versionStatus" | "observedVersions" | "ruleIds" | "evidenceRefs"> & { ruleId: string };
const generatorIds = ["ghost", "hugo", "webflow", "hubspot", "contentful", "woocommerce", "nextjs", "react", "vue", "nuxt"] as const;
const assetRules: Array<{ id: TechnologyId; pattern: RegExp }> = [
  { id: "woocommerce", pattern: /^\/wp-content\/plugins\/woocommerce\//i },
  { id: "nextjs", pattern: /^\/_next\/static\/.+\.(?:js|css)$/ },
  { id: "nuxt", pattern: /^\/_nuxt\/.+\.(?:js|css)$/ },
  { id: "react", pattern: /\/(?:react(?:@\d+\.\d+\.\d+)?\/umd\/)?react(?:\.production\.min|\.development)?\.js$/ },
  { id: "vue", pattern: /\/(?:vue(?:@\d+\.\d+\.\d+)?\/dist\/)?vue(?:\.runtime)?(?:\.global|\.esm-browser)?(?:\.prod|\.min)?\.js$/ },
];
export const TECHNOLOGY_ASSET_PATTERNS = assetRules.map(rule => rule.pattern.source);

/** Pure, bounded rules over typed positive observations; no body-text search or vendor inference. */
export function matchTechnologySignal(signal: TechnologyObservation, documentUrl: string): Match | null {
  let documentOrigin: string;
  try {
    documentOrigin = new URL(documentUrl).origin;
    if (signal.sourceUrl && !safeUrl.safeParse(signal.sourceUrl).success) return null;
  } catch { return null; }
  if (signal.value.length > 256) return null;
  const category = (id: TechnologyId): TechnologyDetection["category"] =>
    id === "php" ? "runtime" : ["nginx", "apache", "iis"].includes(id) ? "server" : ["cloudflare", "cloudfront", "fastly", "akamai"].includes(id) ? "cdn" :
      id === "woocommerce" ? "commerce" : ["nextjs", "react", "vue", "nuxt"].includes(id) ? "framework" : "cms";
  const result = (id: TechnologyId, scope: Match["scope"], confidence: Match["confidence"], rule: string, version: string | null = null): Match =>
    ({ id, category: category(id), scope, confidence, version, ruleId: `${id}.${rule}.v1` });
  if (signal.kind === "generator") {
    for (const id of generatorIds) {
      const name = TECHNOLOGY_NAMES[id].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = new RegExp(`^${name}(?:\\s+(?:v(?:ersion)?\\s*)?([0-9]+(?:\\.[0-9]+){1,3}))?\\s*$`, "i").exec(signal.value);
      if (match) return result(id, category(id) === "framework" ? "page_component" : "page_platform", "high", "generator", match[1] ?? null);
    }
  }
  if (signal.kind === "asset" && signal.sourceUrl) {
    const asset = new URL(signal.sourceUrl);
    if (asset.pathname !== signal.value) return null;
    const rule = assetRules.find(rule => rule.pattern.test(asset.pathname));
    if (rule) return result(rule.id, asset.origin === documentOrigin ? "page_component" : "external_asset", "tentative", "asset");
  }
  if (signal.kind === "marker") {
    if (signal.value === 'script#__NEXT_DATA__[type="application/json"]') return result("nextjs", "page_component", "tentative", "marker");
    if (signal.value === 'script#__NUXT_DATA__[type="application/json"]') return result("nuxt", "page_component", "tentative", "marker");
    if (signal.value === "html[data-wf-site][data-wf-page]") return result("webflow", "page_platform", "tentative", "marker");
  }
  if (signal.kind === "header") {
    const php = /^x-powered-by: PHP(?:\/([0-9]+(?:\.[0-9]+){1,3}))?$/i.exec(signal.value);
    if (php) return result("php", "delivery", "high", "runtime-declaration", php[1] ?? null);
    const server = /^server: (nginx|Apache|Microsoft-IIS)(?:\/([0-9]+(?:\.[0-9]+){1,3}))?$/i.exec(signal.value);
    if (server) return result(({ nginx: "nginx", apache: "apache", "microsoft-iis": "iis" } as const)[server[1]!.toLowerCase() as "nginx" | "apache" | "microsoft-iis"], "delivery", "high", "server-declaration", server[2] ?? null);
    if (signal.value === "x-powered-by: Next.js") return result("nextjs", "page_component", "high", "header-declaration");
    const cdn = ({ "server: cloudflare": "cloudflare", "server: AkamaiGHost": "akamai", "server: Fastly": "fastly", "via: CloudFront; x-amz-cf-id: present": "cloudfront" } as const)[signal.value as "server: cloudflare"];
    if (cdn) return result(cdn, "delivery", "high", "response-header");
  }
  return null;
}

export function assessTechnologySignals(signals: TechnologySignal[], documentUrl: string): TechnologyDetection[] {
  const candidates = signals.flatMap(signal => {
    const match = matchTechnologySignal(signal, documentUrl);
    return match ? [{ ...match, ref: signal.evidenceRef }] : [];
  });
  const keys = [...new Set(candidates.map(row => `${row.id}:${row.scope}`))].sort();
  return keys.map(key => {
    const rows = candidates.filter(row => `${row.id}:${row.scope}` === key), first = rows[0]!;
    const versions = [...new Set(rows.flatMap(row => row.version ? [row.version] : []))].sort();
    const rules = [...new Set(rows.map(row => row.ruleId))].sort();
    const corroborated = ["nextjs", "nuxt"].includes(first.id) && first.scope === "page_component" &&
      rules.some(id => id.endsWith(".asset.v1")) && rules.some(id => id.endsWith(".marker.v1"));
    return { id: first.id, category: first.category, scope: first.scope,
      confidence: rows.some(row => row.confidence === "high") || corroborated ? "high" : "tentative",
      version: versions.length === 1 ? versions[0]! : null,
      versionStatus: versions.length > 1 ? "conflicting" : versions.length ? "declared" : "not_detected",
      observedVersions: versions, ruleIds: rules, evidenceRefs: [...new Set(rows.map(row => row.ref))].sort(),
    };
  });
}
export const technologyInventorySchema = z.object({
  ruleset: z.literal(TECHNOLOGY_RULESET), documentUrl: safeUrl,
  signals: z.array(signalSchema).max(16), detections: z.array(detectionSchema).max(18), truncated: z.boolean(),
}).strict().superRefine((value, ctx) => {
  const expected = assessTechnologySignals(value.signals, value.documentUrl);
  // Compare fields, allowing JSONB object-key reordering.
  const valid = value.detections.length === expected.length && expected.every((row, i) => {
    const actual = value.detections[i]!;
    return (Object.keys(row) as Array<keyof TechnologyDetection>).every(key => JSON.stringify(row[key]) === JSON.stringify(actual[key]));
  });
  if (!valid || new Set(value.signals.map(row => row.evidenceRef)).size !== value.signals.length ||
      value.signals.some(row => !matchTechnologySignal(row, value.documentUrl) || row.kind !== "asset" && row.sourceUrl !== value.documentUrl) ||
      new TextEncoder().encode(JSON.stringify(value)).length > TECHNOLOGY_INVENTORY_MAX_BYTES)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Technology inventory must reproduce bounded, source-bound observations" });
});
export type TechnologyInventory = z.infer<typeof technologyInventorySchema>;

export function buildTechnologyInventory(signals: TechnologySignal[], documentUrl: string, truncated = false): TechnologyInventory {
  const retained: TechnologySignal[] = [];
  const groups = new Map<string, TechnologySignal[]>();
  const result = (): TechnologyInventory => ({ ruleset: TECHNOLOGY_RULESET, documentUrl, signals: retained, detections: assessTechnologySignals(retained, documentUrl), truncated });
  for (const signal of signals) {
    const match = matchTechnologySignal(signal, documentUrl);
    if (!match) continue;
    const key = `${match.id}:${match.scope}`, group = groups.get(key) ?? [];
    if (!group.some(row => row.kind === signal.kind && row.value === signal.value && row.sourceUrl === signal.sourceUrl)) group.push(signal);
    groups.set(key, group);
  }
  // Keep each identity/scope atomically. Dropping only a later version could turn
  // known conflicting evidence into a misleading single declared version.
  for (const group of groups.values()) {
    const start = retained.length;
    retained.push(...group);
    const candidate = result();
    if (retained.length > 16 || candidate.detections.some(row => row.observedVersions.length > 8) ||
        new TextEncoder().encode(JSON.stringify(candidate)).length > TECHNOLOGY_INVENTORY_MAX_BYTES - 1) {
      retained.splice(start); truncated = true;
    }
  }
  return result();
}
