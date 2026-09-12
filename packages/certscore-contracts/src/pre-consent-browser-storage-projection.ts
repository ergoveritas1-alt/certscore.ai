import { z } from "zod";

export const PRE_CONSENT_BROWSER_STORAGE_PROJECTION_VERSION =
  "certscore.pre-consent-browser-storage-projection.v1";
export const MAX_PRE_CONSENT_BROWSER_STORAGE_KEYS_PER_TYPE = 100;

const boundedStorageKeySchema = z.string().trim().min(1).max(240);

const legacyPreConsentBrowserStorageProjectionSchema = z.object({
  contractVersion: z.literal(PRE_CONSENT_BROWSER_STORAGE_PROJECTION_VERSION),
  scanId: z.string().min(1),
  assessmentStatus: z.enum(["observed", "not_observed", "not_testable"]),
  consentState: z.literal("pre_interaction"),
  localStorageKeys: z.array(boundedStorageKeySchema)
    .max(MAX_PRE_CONSENT_BROWSER_STORAGE_KEYS_PER_TYPE),
  sessionStorageKeys: z.array(boundedStorageKeySchema)
    .max(MAX_PRE_CONSENT_BROWSER_STORAGE_KEYS_PER_TYPE),
  retainedStorageSnapshotCount: z.number().int().nonnegative(),
  storageFirstObservedAtMs: z.number().int().nonnegative().nullable(),
  valuesRedacted: z.literal(true),
  evidenceRefs: z.array(z.string().trim().min(1).max(500)).max(8),
  limitationKeys: z.array(z.string().trim().min(1).max(120)).max(8),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceLane: z.literal("runtime_evidence"),
}).superRefine((projection, context) => {
  const retainedKeyCount =
    projection.localStorageKeys.length + projection.sessionStorageKeys.length;

  if (projection.assessmentStatus === "observed" && retainedKeyCount < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Observed browser storage requires at least one retained key",
      path: ["assessmentStatus"],
    });
  }
  if (projection.assessmentStatus === "not_observed" && retainedKeyCount > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A not-observed browser storage projection cannot retain observed keys",
      path: ["assessmentStatus"],
    });
  }
  if (
    projection.assessmentStatus !== "not_testable" &&
    projection.retainedStorageSnapshotCount < 1
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A checked browser storage projection requires a retained snapshot",
      path: ["retainedStorageSnapshotCount"],
    });
  }
});

export const originBoundStorageEntrySchema = z.object({
  origin: z.string().refine(value => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && url.origin === value; } catch { return false; } }),
  storageType: z.enum(["localStorage", "sessionStorage"]),
  key: z.string().max(4096),
  capturedAtMs: z.number().int().nonnegative(),
  evidenceRefs: z.array(z.string().min(1).max(500)).min(1).max(8),
});
export const originBoundBrowserStorageProjectionSchema = legacyPreConsentBrowserStorageProjectionSchema.innerType().extend({
  contractVersion: z.literal("certscore.pre-consent-browser-storage-projection.v2"),
  localStorageKeys: z.array(z.string().max(4096)).max(100),
  sessionStorageKeys: z.array(z.string().max(4096)).max(100),
  entries: z.array(originBoundStorageEntrySchema).max(200),
}).superRefine((value, context) => {
  const invalid = value.retainedStorageSnapshotCount < 1 ||
    (value.assessmentStatus === "observed" && !value.entries.length) ||
    (value.assessmentStatus === "not_observed" && value.entries.length > 0) ||
    ["localStorage", "sessionStorage"].some(type => {
      const keys = value[`${type}Keys` as "localStorageKeys" | "sessionStorageKeys"];
      const entries = value.entries.filter(entry => entry.storageType === type);
      return keys.some(key => !entries.some(entry => entry.key === key)) || entries.some(entry => !keys.includes(entry.key));
    }) || new Set(value.entries.map(entry => JSON.stringify([entry.origin, entry.storageType, entry.key]))).size !== value.entries.length;
  if (invalid) context.addIssue({ code: "custom", message: "Inconsistent origin-bound storage evidence" });
});
export const preConsentBrowserStorageProjectionSchema = z.union([legacyPreConsentBrowserStorageProjectionSchema, originBoundBrowserStorageProjectionSchema]);

export type PreConsentBrowserStorageProjection = z.infer<
  typeof preConsentBrowserStorageProjectionSchema
>;
