// Wire format from OpenAI web pixel 0.1.105. The caller has already enforced
// byte, member and depth caps and rejected duplicate JSON keys.
import { z } from "zod";
import { openAiPixelEventTypeSchema } from "@certscore/contracts";

const scalar = z.union([z.string(), z.number()]);
const count = z.number().int().nonnegative();
const counts = z.record(count);
const config = z.object({
  automatic_advanced_matching: z.enum(["enabled","disabled","not_found","invalid","request_failed"]),
  retry_attempted: z.boolean().optional(), retry_succeeded: z.boolean().optional(),
}).strict();
const diagnostic = z.object({
  type: z.literal("diagnostic"), schema_version: z.literal(1), consent: z.boolean().optional(),
  is_first_visit_in_session: z.boolean().optional(), is_first_consent_grant_in_session: z.boolean().optional(),
  dropped_event_count: count, dropped_event_reason_counts: counts, dropped_event_name_counts: counts,
  dropped_event_phase_counts: counts, config: config.optional(),
}).strict();
const item = z.object({
  id: scalar.optional(), name: z.string().optional(), content_type: z.string().optional(),
  quantity: z.number().optional(), amount: z.number().optional(), currency: z.string().optional(),
}).strict();
const measurement = z.object({
  type: z.string().optional(), plan_id: scalar.optional(), amount: z.number().optional(),
  currency: z.string().optional(), contents: z.array(item).optional(),
}).strict();
const common = {
  test_session_id:z.string().nullable().optional(), timestamp_ms:count.optional(), id:z.string().optional(),
  source_url:z.string().optional(), referrer_url:z.string().optional(), opt_out:z.boolean().optional(),
  oppref:z.string().optional(),
};
const event = z.union([
  z.object({...common,type:openAiPixelEventTypeSchema,custom_event_name:z.string().optional(),data:measurement.optional()}).strict(),
  z.object({...common,type:z.literal("openai::sdk_init"),data:z.object({type:z.literal("sdk_lifecycle")}).strict()}).strict(),
  z.object({...common,type:z.literal("oai::diagnostic"),data:diagnostic}).strict(),
]);
const contact = z.union([z.string(),z.array(z.string())]);
const matching = z.object({
  em:contact.optional(), ph:contact.optional(), php:contact.optional(), eid:z.string().optional(),
  co:z.string().optional(), ct:z.string().optional(), rg:z.string().optional(), pc:z.string().optional(),
  fn:z.string().optional(), ln:z.string().optional(),
}).strict();
const envelope = z.object({
  events:z.array(event).min(1).max(8), oppref:z.string().optional(), obref:z.string().optional(),
  user:z.object({in:matching.optional(),fm:matching.optional(),ht:matching.optional(),js:matching.optional()}).strict().optional(),
  client_hints:z.object({model:z.string().optional(),platform:z.string().optional(),platform_version:z.string().optional(),
    full_version_list:z.array(z.object({brand:z.string(),version:z.string()}).strict()).optional()}).strict().optional(),
}).strict();

export function inspectOpenAiPixelBatch(url: URL, body: unknown) {
  const parsed = envelope.safeParse(body);
  const pixels = url.searchParams.getAll("pid"), countParam = url.searchParams.getAll("ec");
  if (!parsed.success || pixels.length !== 1 || !/^[A-Za-z0-9_-]{1,128}$/.test(pixels[0]!) ||
      (countParam.length && (countParam.length !== 1 || countParam[0] !== String(parsed.data.events.length)))) {
    throw Error("unsupported_fields");
  }
  if (parsed.data.events.some(event => event.opt_out === true ||
      (event.type === "oai::diagnostic" && event.data.consent === false))) return "restriction_observed" as const;
  return parsed.data.events.some(event => event.type !== "openai::sdk_init" && event.type !== "oai::diagnostic")
    ? "measurement_observed" as const : "telemetry_only" as const;
}
