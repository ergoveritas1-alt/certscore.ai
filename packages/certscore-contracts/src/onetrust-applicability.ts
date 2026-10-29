import { z } from "zod";

/** A source-review pin, not CMP identification or a domain classification. */
export const ONETRUST_IKEA_APPLICABILITY = {
  policyVersion: "onetrust_ikea_applicability.v1",
  documentUrl: "https://www.ikea.com/",
  documentSha256: "6420ce745460bdabd427ff8e64a049fd504eadf3d5a24b8c8e4afd05ebb462a3",
  sdkUrl: "https://cdn.cookielaw.org/scripttemplates/202508.2.0/otBannerSdk.js",
  sdkSha256: "69d65ec22a3d484d852e795b79517d6757749efdec5c6842b4968a3333afd2c9",
  sdkBytes: 511534,
} as const;
type CategoryRule = "always_or_inventory" | "inventory" | "inventory_without_services" | "conditional_always";
/** Each reviewed source is registered atomically with its actual category rule.
 * New versions cannot silently inherit a default because a second table was missed. */
const reviewedSourceDefinitions: ReadonlyArray<{sdkUrl:string;sdkSha256:string;sdkBytes:number;rule:CategoryRule}> = [
{
  "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202602.1.0/otBannerSdk.js",
  "sdkSha256": "b7171dca698ca454704426d1ff6c7514c6e0d6c415931b37da63d4c7b77ed8c6",
  "sdkBytes": 543890,
  "rule": "always_or_inventory"
},
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202508.2.0/otBannerSdk.js",
    "sdkSha256": "69d65ec22a3d484d852e795b79517d6757749efdec5c6842b4968a3333afd2c9",
    "sdkBytes": 511534,
    "rule": "always_or_inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202604.2.0/otBannerSdk.js",
    "sdkSha256": "6360568655a50bd856b4678504da3f2e472c9d049d26edd14695c65b0934efbb",
    "sdkBytes": 566048,
    "rule": "always_or_inventory"
  },
  {
    "sdkUrl": "https://cookie-cdn.cookiepro.com/scripttemplates/202604.2.0/otBannerSdk.js",
    "sdkSha256": "6360568655a50bd856b4678504da3f2e472c9d049d26edd14695c65b0934efbb",
    "sdkBytes": 566048,
    "rule": "always_or_inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202608.1.0/otBannerSdk.js",
    "sdkSha256": "3d2f7f7ae2fdfbf24acada1eaeaa636b84db784d2587115af8c7288565c65208",
    "sdkBytes": 604329,
    "rule": "always_or_inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202211.2.0/otBannerSdk.js",
    "sdkSha256": "49582965b8ddcb8f728f5b4d33b2c73e138690f5c6815bd9918de94f62f4b80b",
    "sdkBytes": 392535,
    "rule": "inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202609.2.0/otBannerSdk.js",
    "sdkSha256": "fdfc3d5184a8b3ffc2baf79a230c91958aee88c84fb370a52ca3802b3ee34059",
    "sdkBytes": 615081,
    "rule": "always_or_inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202409.2.0/otBannerSdk.js",
    "sdkSha256": "d20357455b511ce933ce8d435007781a67ad2c01453af9b88f79e57e14476add",
    "sdkBytes": 472088,
    "rule": "inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/6.34.0/otBannerSdk.js",
    "sdkSha256": "e88dafe889a514ea8b9b07747f53d08b66a473b7caa78645b4aa2167563651e7",
    "sdkBytes": 356817,
    "rule": "inventory_without_services"
  },
  {
    "sdkUrl": "https://cdn-apac.onetrust.com/scripttemplates/6.36.0/otBannerSdk.js",
    "sdkSha256": "00bab1a0ca70bae23e6e733c1b78045476a2d2688aa0c5cf26fc7efa81ccaa0b",
    "sdkBytes": 370595,
    "rule": "inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202609.1.0/otBannerSdk.js",
    "sdkSha256": "84e6cbb4db5f6050eadc809086f969d41d3f779091b2a98686b2887f8c3946a0",
    "sdkBytes": 606369,
    "rule": "always_or_inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202511.1.0/otBannerSdk.js",
    "sdkSha256": "d82ebde730f1c2caa2a648f84319b2a9f9e2fb411f0d9ded2cb552ffd7d7f7af",
    "sdkBytes": 525881,
    "rule": "always_or_inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202411.1.0/otBannerSdk.js",
    "sdkSha256": "0c5e5da9ad3458d5cbdf9c3262174f7689b8e42a1c7acf3675f7b2feb19afcf7",
    "sdkBytes": 472974,
    "rule": "inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202411.2.0/otBannerSdk.js",
    "sdkSha256": "de1a8047684fd201c0d9a0a1d7e4c02221f7e34e8433fdd0940f30b1ecf4c957",
    "sdkBytes": 474797,
    "rule": "inventory"
  },
  {
    "sdkUrl": "https://cdn-ukwest.onetrust.com/scripttemplates/202502.1.0/otBannerSdk.js",
    "sdkSha256": "d7f711dcac78c2cfccb1b713b341f3da3d7717d891b50b7807c65f5553db2867",
    "sdkBytes": 488612,
    "rule": "inventory"
  },
  {
    "sdkUrl": "https://cdn.cookielaw.org/scripttemplates/202505.1.0/otBannerSdk.js",
    "sdkSha256": "ea84193c3562ce2927329b92fcc12c77ee02e441dcc5f616132f48bf5fbc1bc8",
    "sdkBytes": 504085,
    "rule": "conditional_always"
  },
  {
    "sdkUrl": "https://cdn-ukwest.onetrust.com/scripttemplates/202512.1.0/otBannerSdk.js",
    "sdkSha256": "8334dddfc6e7e5838810a2e96eb7df90b737babc4a6331622827b3c3e534ab2f",
    "sdkBytes": 531687,
    "rule": "always_or_inventory"
  }
];
/** Public source proof contract remains URL/hash/size only. */
export const ONETRUST_REVIEWED_SDKS = reviewedSourceDefinitions.map(({rule: _rule, ...pin}) => pin);
export function oneTrustCategoryRule(source?: {sdkUrl:string;sdkSha256:string}): CategoryRule {
  return reviewedSourceDefinitions.find(pin=>pin.sdkUrl===source?.sdkUrl && pin.sdkSha256===source?.sdkSha256)?.rule ?? "always_or_inventory";
}
export function oneTrustInventoryOnlySource(source: {sdkUrl:string;sdkSha256:string}) {
  return ["inventory", "inventory_without_services"].includes(oneTrustCategoryRule(source));
}
export const ONETRUST_ACTIVE_CATEGORY_POLICY = "onetrust_effective_categories.v3-active-scope" as const;
export const ONETRUST_EFFECTIVE_CATEGORY_POLICY = "onetrust_effective_categories.v2" as const;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const count = z.number().int().min(0).max(10000);
export const oneTrustApplicabilityGroupSchema = z.object({
  id, status: z.enum(["always active", "active", "inactive"]),
  type: z.literal("COOKIE"), root: z.literal(true), named: z.literal(true),
  isIabPurpose: z.literal(false), showInPopup: z.boolean(), alwaysShowCategory: z.boolean(),
  firstPartyCookies: count, hosts: count, generalVendors: count, vendorServices: count,
}).strict();
export type OneTrustApplicabilityGroup = z.infer<typeof oneTrustApplicabilityGroupSchema>;

/** Reviewed populateGroups/isValidConsentNoticeGroup/isValidGroup semantics,
 * restricted to flat COOKIE roots and non-IAB configuration. */
type ApplicabilityGroupInput = Omit<OneTrustApplicabilityGroup,"alwaysShowCategory"> & {alwaysShowCategory:boolean|null};
function hasInventory(g: ApplicabilityGroupInput, rule: CategoryRule) {
  return g.firstPartyCookies > 0 || g.hosts > 0 || g.generalVendors > 0 ||
    (rule !== "inventory_without_services" && g.vendorServices > 0);
}
/** The 202505 revision consults a private feature flag. Interpret only inputs
 * whose effective membership is identical under both possible flag values. */
export function oneTrustApplicabilityInputsSupported(groups: ApplicabilityGroupInput[], source?: {sdkUrl:string;sdkSha256:string}) {
  const rule=oneTrustCategoryRule(source);
  return rule !== "conditional_always" || groups.every(g=>!g.showInPopup || !g.alwaysShowCategory || hasInventory(g,rule));
}
export function oneTrustEffectiveGroups(groups: ApplicabilityGroupInput[], source?: {sdkUrl:string;sdkSha256:string}) {
  const rule=oneTrustCategoryRule(source);
  if (!oneTrustApplicabilityInputsSupported(groups,source)) return [];
  return groups.filter(g=>g.showInPopup && ((rule === "always_or_inventory" && g.alwaysShowCategory) || hasInventory(g,rule)));
}
export const oneTrustApplicabilityInputsSchema = z.object({
  isIabEnabled: z.literal(false), vendorLevelOptOut: z.literal(false), useGoogleVendors: z.literal(false),
  groups: z.array(oneTrustApplicabilityGroupSchema).min(2).max(64),
}).strict().superRefine((value, ctx) => {
  const effective = oneTrustEffectiveGroups(value.groups);
  if (new Set(value.groups.map(g => g.id)).size !== value.groups.length ||
    effective.length === value.groups.length || !effective.some(g => g.status === "always active") ||
    !effective.some(g => g.status !== "always active") ||
    value.groups.some(g => g.status === "always active" && !effective.includes(g))) {
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Applicability needs unique supported groups, an optional choice, and preserved required categories."});
  }
});
// The old revision does not read this flag. Retain its observed boolean, or
// null when unavailable; do not manufacture a false observation.
export const oneTrustLegacyApplicabilityInputsSchema = z.object({
  isIabEnabled:z.literal(false),vendorLevelOptOut:z.literal(false),useGoogleVendors:z.literal(false),
  groups:z.array(oneTrustApplicabilityGroupSchema.extend({alwaysShowCategory:z.boolean().nullable()})).min(2).max(64),
}).strict().refine(value=>new Set(value.groups.map(g=>g.id)).size===value.groups.length,"Group IDs must be unique.");
export const oneTrustSdkSourceSchema = z.object({
  sdkUrl: z.string().url().max(240),
  sdkSha256: sha,
  sdkBytes: z.number().int().positive().max(2 * 1024 * 1024),
  documentSha256: sha,
  documentEpochSha256: sha, observedAtEpochMs: z.number().int().positive(),
  responseStatus: z.literal(200), redirected: z.literal(false), serviceWorker: z.literal(false),
}).strict().refine(source => ONETRUST_REVIEWED_SDKS.some(pin => pin.sdkUrl === source.sdkUrl &&
  pin.sdkSha256 === source.sdkSha256 && pin.sdkBytes === source.sdkBytes), "Served SDK bytes must match a reviewed source revision.");
export const oneTrustApplicabilityEvidenceSchema = z.object({
  policyVersion: z.enum([ONETRUST_IKEA_APPLICABILITY.policyVersion, ONETRUST_EFFECTIVE_CATEGORY_POLICY, ONETRUST_ACTIVE_CATEGORY_POLICY]),
  source: oneTrustSdkSourceSchema,
  scriptBinding: z.object({policyVersion:z.literal("onetrust_script_binding.v2-identical-elements"),matchingElements:z.number().int().min(2).max(8)}).strict().optional(),
  inputs: z.union([oneTrustApplicabilityInputsSchema,oneTrustLegacyApplicabilityInputsSchema]),
  configurationSha256: sha,
  baselineReadAtEpochMs: z.number().int().positive(),
  confirmationReadAtEpochMs: z.number().int().positive(),
}).strict().superRefine((value,ctx) => {
  const effective=oneTrustEffectiveGroups(value.inputs.groups,value.source);
  if (value.scriptBinding && value.policyVersion !== ONETRUST_ACTIVE_CATEGORY_POLICY) ctx.addIssue({code:z.ZodIssueCode.custom,message:"Identical-element binding is restricted to the new proof version."});
  if (!oneTrustApplicabilityInputsSupported(value.inputs.groups,value.source)) {
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Unobserved SDK feature flags must not change effective category membership."});
  }
  if (!oneTrustInventoryOnlySource(value.source) && value.inputs.groups.some(g=>g.alwaysShowCategory===null)) {
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Modern SDK applicability requires an observed AlwaysShowCategory boolean."});
  }
  if (!effective.some(g=>g.status==="always active") || !effective.some(g=>g.status!=="always active") || effective.length===value.inputs.groups.length ||
    value.inputs.groups.some(g=>g.status==="always active"&&!effective.includes(g) &&
      (value.policyVersion !== ONETRUST_ACTIVE_CATEGORY_POLICY || g.showInPopup))) {
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Version-specific category predicates must preserve required categories and optional choice."});
  }
  if (value.policyVersion === ONETRUST_IKEA_APPLICABILITY.policyVersion &&
    (value.source.documentSha256 !== ONETRUST_IKEA_APPLICABILITY.documentSha256 ||
      value.source.sdkUrl !== ONETRUST_IKEA_APPLICABILITY.sdkUrl || value.source.sdkSha256 !== ONETRUST_IKEA_APPLICABILITY.sdkSha256)) {
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Historical IKEA applicability retains its exact document and source boundary."});
  }
  if (value.source.observedAtEpochMs > value.baselineReadAtEpochMs ||
    value.baselineReadAtEpochMs > value.confirmationReadAtEpochMs) {
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"The served SDK must be verified before the same-document baseline and confirmation reads."});
  }
});
export type OneTrustApplicabilityEvidence = z.infer<typeof oneTrustApplicabilityEvidenceSchema>;
export type OneTrustSdkSource = z.infer<typeof oneTrustSdkSourceSchema>;

export function validateOneTrustApplicabilityEnvelope(value: OneTrustApplicabilityEvidence | undefined,
  envelope: {startedAt:string; completedAt:string; dispatchedAtMs?:number; frameIdentitySha256?:string}, context:z.RefinementCtx) {
  if (!value) return;
  const start = Date.parse(envelope.startedAt), end = Date.parse(envelope.completedAt);
  const click = envelope.dispatchedAtMs === undefined ? NaN : start + envelope.dispatchedAtMs;
  if (!Number.isFinite(click) || value.source.observedAtEpochMs < start ||
    value.baselineReadAtEpochMs > click || value.confirmationReadAtEpochMs < click ||
    value.confirmationReadAtEpochMs > end || value.source.documentSha256 !== envelope.frameIdentitySha256) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["decisionEvidence"],
      message:"SDK applicability must bind to this packet's document, baseline, dispatched action and bounded confirmation."});
  }
}

/** Typed applicability diagnostics shared by new capture and retained review.
 * V3 may exclude hidden required declarations only through the reviewed source
 * predicate; a visible required group and an optional choice must remain. */
export function oneTrustApplicabilityReason(inputs: unknown, source: OneTrustSdkSource): import("./consent-confirmation-diagnostics").ConsentConfirmationReason {
  const parsed = oneTrustLegacyApplicabilityInputsSchema.safeParse(inputs);
  if (!parsed.success) {
    const raw = inputs as Partial<z.infer<typeof oneTrustLegacyApplicabilityInputsSchema>> | null;
    if ([raw?.isIabEnabled,raw?.vendorLevelOptOut,raw?.useGoogleVendors].some(v=>(v as unknown) === true)) return "category_iab_unsupported";
    if (Array.isArray(raw?.groups)) {
      if (raw.groups.some(g=>g.root !== true)) return "category_hierarchy_unsupported";
      if (raw.groups.some(g=>g.type !== "COOKIE" || g.isIabPurpose !== false)) return "category_type_unsupported";
    }
    return "category_inputs_malformed";
  }
  const groups=parsed.data.groups;
  if (!oneTrustInventoryOnlySource(source) && groups.some(g=>g.alwaysShowCategory === null)) return "category_inputs_malformed";
  if (!oneTrustApplicabilityInputsSupported(groups,source)) return "category_private_flag_unresolved";
  const effective=oneTrustEffectiveGroups(groups,source);
  if (!effective.some(g=>g.status === "always active")) return "category_no_required";
  if (!effective.some(g=>g.status !== "always active")) return "category_no_optional";
  if (groups.some(g=>g.status === "always active" && g.showInPopup && !effective.includes(g))) return "category_required_excluded";
  if (effective.length === groups.length) return "category_exclusion_unneeded";
  return "category_applicability_verified";
}
