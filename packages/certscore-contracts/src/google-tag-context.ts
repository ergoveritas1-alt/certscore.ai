import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const settings = z.object({
  allow_google_signals: z.boolean().optional(),
  allow_ad_personalization_signals: z.boolean().optional(),
  ads_data_redaction: z.boolean().optional(),
}).strict();

/** Queued declarations only. A snapshot is neither execution nor account-link proof. */
export const googleTagContextSchema = z.object({
  contractVersion: z.literal("google_tag_context.v1"),
  scope: z.literal("main_document_queue_snapshot"),
  documentToken: z.string().min(1).max(160),
  documentUrlSha256: hash,
  capturedAtEpochMs: z.number().int().nonnegative(),
  backendAdsLink: z.literal("not_observable"),
  audienceUse: z.literal("not_established"),
  coverage: z.literal("sampled"),
  queuesObserved: z.number().int().min(0).max(3),
  inspectedEntries: z.number().int().min(0).max(64),
  limitations: z.array(z.enum(["queue_unavailable", "accessor_omitted", "unsupported_entry", "entry_limit", "row_limit", "time_limit", "queue_read_failed"])).max(7),
  rows: z.array(z.object({
    queueHash: hash,
    queueIndex: z.number().int().min(0).max(1_000_000_000),
    command: z.enum(["config", "event", "set"]),
    eventKind: z.enum(["conversion", "page_view", "other"]).optional(),
    destinations: z.array(z.object({
      namespace: z.enum(["G", "AW", "DC", "GT"]),
      tagIdHash: hash,
      routeHash: hash,
      conversionLabelPresent: z.boolean(),
    }).strict()).max(4),
    settings,
  }).strict()).max(8),
}).strict().superRefine((value, ctx) => {
  if (value.rows.length > value.inspectedEntries ||
    new Set(value.rows.map(r => `${r.queueHash}:${r.queueIndex}`)).size !== value.rows.length ||
    value.rows.some(r => (r.command === "event") !== Boolean(r.eventKind) ||
      r.command === "config" && r.destinations.length !== 1 ||
      r.command === "set" && (r.destinations.length !== 0 || Object.keys(r.settings).length === 0) ||
      r.command === "event" && r.destinations.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Google tag context requires consistent bounded queued declarations." });
  }
});
export type GoogleTagContext = z.infer<typeof googleTagContextSchema>;
