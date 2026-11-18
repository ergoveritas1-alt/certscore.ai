import { createHash } from "node:crypto";
import { z } from "zod";
import type { OneTrustGpcCookieReceipt } from "@certscore/contracts";
import { getRegistrableDomain } from "./domain-utils.js";
import { matchesCanonicalCmpCookieName } from "./cmp-cookie-name.js";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const time = z.number().int().nonnegative().max(86_400_000);
const documentSchema = z.object({ token: id, urlSha256: sha256 }).strict();
const cookieSchema = z.object({ name: z.string().min(1).max(180), value: z.string().max(2048),
  domain: z.string().min(1).max(253), path: z.string().min(1).max(1024),
  secure: z.boolean(), partitionKey: z.string().max(1024).optional(), expires: z.number().finite(),
}).strict();
/** Private, ephemeral input only. Never append these bytes to canonical artifacts.
 * A caller must supply the original receipt for an already-loaded read, together
 * with its independently retained original binding. */
const inputSchema = z.object({
  contractVersion: z.literal("certscore.onetrust-receipt-input.local.v1"),
  scanId: id, lane: z.enum(["runtime_evidence", "gpc_observation"]), sessionId: id,
  startedAtMs: time, completedAtMs: time,
  before: documentSchema, after: documentSchema,
  cookies: z.array(cookieSchema).max(16),
}).strict();
const expectedSchema = z.object({
  scanId: id, lane: z.enum(["runtime_evidence", "gpc_observation"]), sessionId: id,
  document: documentSchema, committedAtMs: time, frozenAtMs: time,
  documentUrl: z.string().url().max(4096), observedAtEpochSeconds: z.number().finite().positive(),
}).strict();

export const localOneTrustGpcReceiptSchema = z.object({
  contractVersion: z.literal("certscore.onetrust-gpc-receipt.local.v1"),
  internalOnly: z.literal(true), productionProjectable: z.literal(false), scoreEffect: z.literal("none"),
  scanId: id, sourceSha256: sha256, sdkVersion: z.literal("202303.1.0"),
  observedAfterDocumentCommitMs: time,
  browserGpcFlag: z.boolean(),
  /** Documented combined browser/category flag. False cannot establish why. */
  gpcCategoryFlag: z.boolean(),
  sale: z.literal("not_assessed"), sharing: z.literal("not_assessed"),
  honoring: z.literal("not_assessed"),
}).strict().refine(v => !v.gpcCategoryFlag || v.browserGpcFlag)
  .refine(v => Buffer.byteLength(JSON.stringify(v)) <= 768);
export interface LocalOneTrustGpcReceipt extends z.infer<typeof localOneTrustGpcReceiptSchema> {}
export type LocalOneTrustReceiptBinding = z.infer<typeof expectedSchema>;

/** Decode only the reviewed flags. The caller verifies the source and its read binding. */
export function parseOneTrustGpcCookieReceipt(cookies: readonly z.infer<typeof cookieSchema>[], url: URL,
  observedAtEpochSeconds: number): OneTrustGpcCookieReceipt | undefined {
  if (url.protocol !== "https:" || url.username || url.password || !Number.isFinite(observedAtEpochSeconds) || observedAtEpochSeconds <= 0) return;
  const domain = getRegistrableDomain(url.hostname);
  if (!domain) return;
  let candidate: (typeof cookies)[number] | undefined;
  for (const cookie of cookies) {
    if (!cookie.name.startsWith("OptanonConsent") || !matchesCanonicalCmpCookieName(cookie.name, "OptanonConsent") || cookie.name !== cookie.name.trim() ||
      cookie.domain !== cookie.domain.toLowerCase() ||
      (url.hostname !== cookie.domain.replace(/^\./, "") && !(cookie.domain.startsWith(".") && url.hostname.endsWith(cookie.domain))) ||
      getRegistrableDomain(cookie.domain.replace(/^\./, "")) !== domain ||
      (url.pathname !== cookie.path && !url.pathname.startsWith(cookie.path.endsWith("/") ? cookie.path : cookie.path + "/"))) continue;
    // A stale, oversized or partitioned sibling still makes this read ambiguous.
    if (candidate) return;
    candidate = cookie;
  }
  if (!candidate) return;
  const { name, value, domain: cookieDomain, path, secure, partitionKey, expires } = candidate;
  if (!cookieSchema.safeParse({ name, value, domain: cookieDomain, path, secure, partitionKey, expires }).success ||
    !secure || partitionKey !== undefined || (expires !== -1 && expires <= observedAtEpochSeconds) ||
    !value || /[\u0000-\u001f\u007f]/.test(value) || /%(?![a-f0-9]{2})/i.test(value)) return;
  const fields = new URLSearchParams(value), keys = new Set<string>();
  for (const [key] of fields) {
    if (keys.size === 32 || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || keys.has(key.toLowerCase())) return;
    keys.add(key.toLowerCase());
  }
  const version = fields.get("version"), browser = fields.get("browserGpcFlag"), category = fields.get("isGpcEnabled");
  if (version !== "202303.1.0" || !["0", "1"].includes(browser ?? "") || !["0", "1"].includes(category ?? "") ||
    (category === "1" && browser !== "1")) return;
  return { sdkVersion: version, browserGpcFlag: browser === "1", gpcCategoryFlag: category === "1" };
}

/** CPU-only local reader. Verify original bytes before parsing. The independent
 * expected binding must come from the original same-session read checkpoint,
 * never reconstructed from this input or a merged GPC observation.
 * Official field semantics: docs.onetrust.com > OneTrust Cookies. Initial exact
 * version comes from its documented example; other SDK versions fail closed. */
export function readLocalOneTrustGpcReceipt(input: {
  bytes: Uint8Array; pointer: { sha256: string; sizeBytes: number };
  expected: LocalOneTrustReceiptBinding;
}): LocalOneTrustGpcReceipt | undefined {
  try {
    if (!input.bytes.length || input.bytes.length > 16_384 || input.bytes.length !== input.pointer.sizeBytes ||
      !sha256.safeParse(input.pointer.sha256).success ||
      createHash("sha256").update(input.bytes).digest("hex") !== input.pointer.sha256) return;
    const expected = expectedSchema.parse(input.expected);
    const text = Buffer.from(input.bytes).toString("utf8");
    const decoded = JSON.parse(text);
    // This private envelope has one canonical JSON encoding. This also rejects
    // duplicate/escaped-alias fields that JSON.parse would silently overwrite.
    if (!Buffer.from(text).equals(Buffer.from(input.bytes)) || JSON.stringify(decoded) !== text) return;
    const source = inputSchema.parse(decoded);
    const url = new URL(expected.documentUrl);
    if (url.protocol !== "https:" || url.username || url.password) return;
    url.hash = "";
    if (createHash("sha256").update(url.href).digest("hex") !== expected.document.urlSha256 ||
      source.scanId !== expected.scanId || source.lane !== expected.lane || source.sessionId !== expected.sessionId ||
      source.before.token !== expected.document.token || source.after.token !== expected.document.token ||
      source.before.urlSha256 !== expected.document.urlSha256 || source.after.urlSha256 !== expected.document.urlSha256 ||
      expected.committedAtMs > source.startedAtMs || source.startedAtMs > source.completedAtMs ||
      source.completedAtMs > expected.frozenAtMs) return;
    const receipt = parseOneTrustGpcCookieReceipt(source.cookies, url, expected.observedAtEpochSeconds);
    if (!receipt) return;
    const result = localOneTrustGpcReceiptSchema.safeParse({
      contractVersion: "certscore.onetrust-gpc-receipt.local.v1", internalOnly: true, productionProjectable: false,
      scoreEffect: "none", scanId: source.scanId, sourceSha256: input.pointer.sha256, ...receipt,
      observedAfterDocumentCommitMs: source.completedAtMs - expected.committedAtMs,
      sale: "not_assessed", sharing: "not_assessed", honoring: "not_assessed",
    });
    return result.success ? result.data : undefined;
  } catch { return undefined; }
}
