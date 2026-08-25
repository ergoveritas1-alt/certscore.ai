import { z } from "zod";

export const PRE_CONSENT_BROWSER_STORAGE_PROJECTION_VERSION =
  "certscore.pre-consent-browser-storage-projection.v1";
export const MAX_PRE_CONSENT_BROWSER_STORAGE_KEYS_PER_TYPE = 100;

const boundedStorageKeySchema = z.string().trim().min(1).max(240);

export const preConsentBrowserStorageProjectionSchema = z.object({
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

export type PreConsentBrowserStorageProjection = z.infer<
  typeof preConsentBrowserStorageProjectionSchema
>;
