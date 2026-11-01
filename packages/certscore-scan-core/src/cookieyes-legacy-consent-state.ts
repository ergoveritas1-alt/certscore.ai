import { createHash } from "node:crypto";
import { COOKIEYES_LEGACY_PROTOCOL_SHA256, cookieYesLegacyConfigurationSchema, cookieYesLegacyReceiptEvidenceSchema,
  cookieYesLegacyReceiptDecision, type CookieYesLegacyConfiguration, type ConsentConfirmationReason } from "@certscore/contracts";
import type { BrowserContext } from "playwright";
import type { ActionStateWrite, SemanticState } from "./consent-action-semantic-state.js";
import { captureExactCookieWrite } from "./exact-cookie-write-capture.js";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
type Cookie = Awaited<ReturnType<BrowserContext["cookies"]>>[number];
export const legacyCookieYesIdentity = (cookie: Cookie) => sha(JSON.stringify([
  "cookie_name_domain_path_partition", cookie.domain.toLowerCase().replace(/^\./, ""), cookie.path, cookie.partitionKey ?? "", cookie.name,
]));
export type CookieYesLegacyBaseline = {
  configuration: CookieYesLegacyConfiguration; documentUrl: string; capturedAtEpochMs: number;
  lastSequence: number;
  beforeValueSha256?: string; beforeIdentitySha256?: string;
};

/** The reviewed writer emits a flat JSON object. Parse bounded canonical base64
 * without losing duplicate keys (including escaped aliases) to JSON.parse. */
export function decodeLegacyCookieYesReceipt(value: string): Record<string, unknown> | undefined {
  if (!value || value.length > 2048 || value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined;
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) return undefined;
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").toString("base64") !== value || !/^\s*\{[\s\S]*\}\s*$/.test(text)) return undefined;
  const body = text.trim().slice(1, -1), fields: Record<string, unknown> = Object.create(null);
  const member = /\s*("(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*")\s*:\s*(true|false|"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|[0-9]+)\s*/y;
  let cursor = 0, count = 0;
  while (cursor < body.length) {
    member.lastIndex = cursor;
    const match = member.exec(body);
    if (!match || ++count > 24) return undefined;
    let key: string, val: unknown;
    try { key = JSON.parse(match[1]!); val = JSON.parse(match[2]!); } catch { return undefined; }
    if (key.length > 80 || Object.hasOwn(fields, key) || ["__proto__", "constructor", "prototype"].includes(key)) return undefined;
    fields[key] = val; cursor = member.lastIndex;
    if (cursor === body.length) break;
    if (body[cursor++] !== "," || cursor === body.length) return undefined;
  }
  return fields;
}

/** Whole optional choice only from current bound configuration, a fresh exact
 * setter write and the same current cookie. Retired fields are never categories. */
export function verifyLegacyCookieYesReceipt(input: {
  baseline: CookieYesLegacyBaseline; configuration: unknown; documentUrl: string; cookies: Cookie[];
  writes: ActionStateWrite[]; actionAt: number; readAt: number; onDiagnostic?: (reason: ConsentConfirmationReason) => void;
}): SemanticState | undefined {
  const fail = (reason: ConsentConfirmationReason) => { input.onDiagnostic?.(reason); return undefined; };
  const before = cookieYesLegacyConfigurationSchema.safeParse(input.baseline.configuration);
  const current = cookieYesLegacyConfigurationSchema.safeParse(input.configuration);
  if (!before.success || !current.success) return fail("configuration_unverifiable");
  if (JSON.stringify(before.data) !== JSON.stringify(current.data)) return fail("configuration_changed");
  if (input.documentUrl !== input.baseline.documentUrl || input.baseline.capturedAtEpochMs > input.actionAt) return fail("sdk_document_changed");
  const cookies = input.cookies.filter(cookie => cookie.name === "CookieLawInfoConsent");
  if (input.cookies.some(cookie => cookie.name === "cookieyes-consent")) return fail("receipt_ambiguous");
  if (cookies.length !== 1) return fail(cookies.length ? "receipt_ambiguous" : "receipt_missing");
  const cookie = cookies[0]!, identity = legacyCookieYesIdentity(cookie);
  if (cookie.httpOnly || cookie.partitionKey || (input.baseline.beforeIdentitySha256 && input.baseline.beforeIdentitySha256 !== identity)) return fail("receipt_identity_changed");
  if (sha(cookie.value) === input.baseline.beforeValueSha256) return fail("no_fresh_decision");
  const write = [...input.writes.slice(-96)].reverse().find(row => row.storageType === "cookie" && row.name === cookie.name);
  if (!write || write.sequence <= input.baseline.lastSequence || write.observedAtEpochMs < input.actionAt || write.observedAtEpochMs > input.readAt) return fail("no_fresh_decision");
  const exact = write.cookieAssignment && write.documentUrl === input.documentUrl ? captureExactCookieWrite({
    assignment: write.cookieAssignment, url: write.documentUrl, observedAtMs: Math.round(write.observedAtEpochMs), source: "main_document_setter",
  }) : undefined;
  if (!exact || exact.name !== cookie.name || exact.identityHash !== identity) return fail("receipt_identity_changed");
  if (write.value !== cookie.value || exact.valueHash !== sha(cookie.value)) return fail("receipt_readback_mismatch");
  const fields = decodeLegacyCookieYesReceipt(cookie.value);
  if (!fields) return fail("receipt_malformed");
  if (fields.ver !== current.data.consentVersion) return fail("configuration_changed");
  if (current.data.categories.some(category => typeof fields[category] !== "boolean" ||
    (current.data.requiredCategories.includes(category) && fields[category] !== true))) return fail("group_universe_incomplete");
  const parsed = cookieYesLegacyReceiptEvidenceSchema.safeParse({policyVersion: "cookieyes_legacy_current_categories.v1",
    protocolSourceSha256: COOKIEYES_LEGACY_PROTOCOL_SHA256, writeBinding: "exact_document_cookie_assignment", controlAncestry: "#cookie-law-info-bar",
    configuration: current.data, configurationCapturedAtEpochMs: input.baseline.capturedAtEpochMs,
    documentSha256: sha(input.documentUrl), cookieIdentitySha256: identity, stateSha256: sha(cookie.value),
    baselineWriteSequence: input.baseline.lastSequence, writeSequence: write.sequence,
    writtenAtEpochMs: Math.round(write.observedAtEpochMs), readAtEpochMs: input.readAt,
    categories: current.data.categories.map(category => ({category, consent: fields[category]})),
  });
  if (!parsed.success) return fail("category_proof_invalid");
  return {key: cookie.name, stateHash: parsed.data.stateSha256, observedAtEpochMs: parsed.data.writtenAtEpochMs,
    decision: cookieYesLegacyReceiptDecision(parsed.data), cookieYesLegacyReceiptEvidence: parsed.data};
}
