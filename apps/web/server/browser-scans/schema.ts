import { z } from "zod";

export const BROWSER_SCAN_SOURCE_TYPE = "browser_extension";
export const BROWSER_SCAN_SOURCE_ID = "BX01";
export const BROWSER_SCAN_MODE = "pre_consent_browser_observed";
export const BROWSER_SCAN_CAPTURE_MODE = "controlled_reload";
export const BROWSER_SCAN_SIGNAL_POPULATION_SOURCE = "browser_extension_bx01";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).optional();
const observedUrlSchema = z.string().url().max(16384);

export const browserScanStartSchema = z.object({
  targetUrl: z.string().url().max(4096),
  scanWindowMs: z.number().int().min(3000).max(60000).optional()
});

const observedAtMsSchema = z.number().int().min(0).max(600000);

export const browserScanEventSchema = z.discriminatedUnion("eventType", [
  z.object({
    consentInteractionObserved: z.boolean().optional(),
    eventType: z.literal("network_request"),
    hostname: boundedString(255),
    initiator: optionalBoundedString(8192),
    observedAtMs: observedAtMsSchema,
    referrer: optionalBoundedString(8192),
    resourceType: optionalBoundedString(80),
    tabId: z.number().int().optional(),
    url: observedUrlSchema
  }),
  z.object({
    consentInteractionObserved: z.boolean().optional(),
    cookieName: boundedString(255),
    domain: boundedString(255),
    eventType: z.enum(["cookie_added", "cookie_changed", "cookie_observed"]),
    expiration: z.number().optional().nullable(),
    httpOnly: z.boolean().optional(),
    observedAtMs: observedAtMsSchema,
    path: z.string().max(1024).optional(),
    sameSite: optionalBoundedString(32),
    secure: z.boolean().optional(),
    source: z.enum(["chrome.cookies.onChanged", "baseline_diff", "polling_observed", "Set-Cookie header"]).optional(),
    timingPrecision: z.enum(["exact_event", "polling_observed", "scan_window_diff"]).optional(),
    valueCaptured: z.literal(false)
  }),
  z.object({
    acceptObserved: z.boolean().optional(),
    bannerObserved: z.boolean(),
    buttonsObserved: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    doNotSellShareObserved: z.boolean().optional(),
    eventType: z.literal("consent_ui_observed"),
    manageObserved: z.boolean().optional(),
    matchedTextSnippets: z.array(z.string().trim().min(1).max(240)).max(12).optional(),
    observedAtMs: observedAtMsSchema,
    rejectObserved: z.boolean().optional(),
    selectorSummary: optionalBoundedString(512)
  }),
  z.object({
    eventType: z.literal("browser_capture_note"),
    message: boundedString(512),
    observedAtMs: observedAtMsSchema,
    sourceId: z.literal(BROWSER_SCAN_SOURCE_ID).optional(),
    sourceType: z.literal(BROWSER_SCAN_SOURCE_TYPE).optional()
  })
]);

export const browserScanEventsUploadSchema = z.object({
  events: z.array(browserScanEventSchema).min(1).max(1000)
});

export const browserScanArtifactSchema = z.object({
  artifactJson: z.record(z.unknown()).default({}),
  artifactType: z.enum(["screenshot", "banner_dom_summary"]),
  contentType: z.string().trim().min(1).max(120)
});

export const browserScanCompleteSchema = z.object({
  durationMs: z.number().int().min(0).max(600000),
  summary: z
    .object({
      bannerObserved: z.boolean().optional(),
      cookieEventCount: z.number().int().min(0).max(100000).optional(),
      networkRequestCount: z.number().int().min(0).max(100000).optional(),
      sourceId: z.literal(BROWSER_SCAN_SOURCE_ID).optional(),
      sourceType: z.literal(BROWSER_SCAN_SOURCE_TYPE).optional()
    })
    .passthrough()
    .default({})
});

const observedSignalValueSchema = z.union([
  z.boolean(),
  z.number().finite(),
  z.string().trim().min(1).max(2000),
  z.array(z.string().trim().min(1).max(2000)).max(250)
]);

export const browserScanObservedSignalSchema = z
  .object({
    category: z.enum(["accessibility", "privacy", "disclosure", "commerce", "financial", "entity", "context"]).default("privacy"),
    confidence: z.number().min(0).max(1).nullable().optional(),
    evidenceRefs: z.array(z.string().trim().min(1).max(4096)).max(250).default([]),
    key: boundedString(255),
    label: boundedString(255),
    observedAtMs: observedAtMsSchema.nullable().optional(),
    populationSource: z.literal(BROWSER_SCAN_SIGNAL_POPULATION_SOURCE),
    provenance: z.object({
      captureMode: z.literal("single_page_user_browser").optional(),
      sourceId: z.literal(BROWSER_SCAN_SOURCE_ID),
      sourceType: z.literal(BROWSER_SCAN_SOURCE_TYPE)
    }),
    value: observedSignalValueSchema,
    valueType: z.enum(["boolean", "number", "text", "string_array"])
  })
  .superRefine((signal, ctx) => {
    const matches =
      (signal.valueType === "boolean" && typeof signal.value === "boolean") ||
      (signal.valueType === "number" && typeof signal.value === "number") ||
      (signal.valueType === "text" && typeof signal.value === "string") ||
      (signal.valueType === "string_array" && Array.isArray(signal.value));

    if (!matches) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Observed signal value must match valueType.",
        path: ["value"]
      });
    }
  });

export const browserScanObservedSignalPackageSchema = z.object({
  observedSignals: z.array(browserScanObservedSignalSchema).max(250),
  provenance: z.object({
    sourceId: z.literal(BROWSER_SCAN_SOURCE_ID),
    sourceType: z.literal(BROWSER_SCAN_SOURCE_TYPE)
  })
});

export type BrowserScanEventInput = z.infer<typeof browserScanEventSchema>;
export type BrowserScanObservedSignalPackageInput = z.infer<typeof browserScanObservedSignalPackageSchema>;
