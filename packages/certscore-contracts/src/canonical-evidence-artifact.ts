/** Server-only storage representation. Never exported from the browser barrel.
 * Receivers must verify the original stored bytes against their authoritative
 * pointer before calling this decoder. The inner checksum is not a receipt. */
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync, brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { z } from "zod";
import { canonicalEvidenceBundleSchema } from "./index";

export const CANONICAL_ARTIFACT_ENCODING_THRESHOLD = 400 * 1024;
export const CANONICAL_ARTIFACT_MAX_DECODED_BYTES = 20_000_000;
const gzipFormat = "certscore.canonical-evidence-artifact.v1" as const;
const brotliFormat = "certscore.canonical-evidence-artifact.v2" as const;
const fields = {
  decodedSizeBytes: z.number().int().min(2).max(CANONICAL_ARTIFACT_MAX_DECODED_BYTES),
  decodedSha256: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.string().min(1).max(CANONICAL_ARTIFACT_MAX_DECODED_BYTES),
};
const gzipEnvelope = z.object({ artifactFormat: z.literal(gzipFormat), encoding: z.literal("gzip_base64"), ...fields }).strict();
const brotliEnvelope = z.object({ artifactFormat: z.literal(brotliFormat), encoding: z.literal("brotli_base64"), ...fields }).strict();
const envelope = z.discriminatedUnion("artifactFormat", [gzipEnvelope, brotliEnvelope]);
export interface GzipCanonicalEvidenceArtifactEnvelope extends z.infer<typeof gzipEnvelope> {}
export interface BrotliCanonicalEvidenceArtifactEnvelope extends z.infer<typeof brotliEnvelope> {}
export type CanonicalEvidenceArtifactEnvelope = GzipCanonicalEvidenceArtifactEnvelope | BrotliCanonicalEvidenceArtifactEnvelope;
export const canonicalEvidenceArtifactEnvelopeSchema: z.ZodType<CanonicalEvidenceArtifactEnvelope> = envelope;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const supportedSchema = (value: unknown) => value === "certscore.v2.canonical-evidence-bundle.v1" ||
  value === "certscore.v2.canonical_evidence_bundle.v1" || value === "certscore.v2.alpha.1";

/** Only oversized canonical evidence is encoded. All fields, array order and
 * JSON values survive. Small/noncanonical JSON keeps its existing format. */
export function serializeCanonicalEvidenceArtifact(value: unknown, indentation?: number): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("Canonical artifact requires JSON data.");
  const bytes = Buffer.from(json);
  const schema = value && typeof value === "object" ? (value as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (bytes.length > CANONICAL_ARTIFACT_ENCODING_THRESHOLD && bytes.length <= CANONICAL_ARTIFACT_MAX_DECODED_BYTES &&
    supportedSchema(schema)) {
    const packed = gzipSync(bytes, { level: 1 });
    const decodedSha256 = sha(bytes);
    const encoded = JSON.stringify({ artifactFormat: gzipFormat, encoding: "gzip_base64", decodedSizeBytes: bytes.length,
      decodedSha256, payload: packed.toString("base64") } satisfies CanonicalEvidenceArtifactEnvelope);
    const encodedBytes = Buffer.byteLength(encoded);
    if (encodedBytes < bytes.length) {
      // Existing gzip output stays exact when it already fits. For a still-
      // oversized compressed artifact, try one fixed native representation.
      // No evidence is removed and no capture/retention allowance is enlarged.
      if (encodedBytes > CANONICAL_ARTIFACT_ENCODING_THRESHOLD) {
        try {
          const brotli = brotliCompressSync(bytes, { params: {
            [constants.BROTLI_PARAM_QUALITY]: 6, [constants.BROTLI_PARAM_LGWIN]: 24,
          } });
          const candidate = JSON.stringify({ artifactFormat: brotliFormat, encoding: "brotli_base64", decodedSizeBytes: bytes.length,
            decodedSha256, payload: brotli.toString("base64") } satisfies CanonicalEvidenceArtifactEnvelope);
          if (Buffer.byteLength(candidate) < encodedBytes) return candidate;
        } catch {
          // A failed optional representation must preserve usable gzip bytes.
        }
      }
      return encoded;
    }
  }
  return indentation === undefined ? json : JSON.stringify(value, null, indentation);
}

/** Legacy JSON is returned exactly as JSON.parse returned it. Encoded input has
 * bounded native decompression, canonical envelope/base64, inner size/SHA and a
 * single supported layer. Existing strict bundle readers can keep their own
 * schema pass; other artifact readers validate decoded bundles here. */
export function parseCanonicalEvidenceArtifact(
  input: Uint8Array | string,
  options: { schemaValidation?: "caller" } = {},
): unknown {
  const text = typeof input === "string" ? input : Buffer.from(input).toString("utf8");
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) {
    if (text.slice(0, 256).includes('"artifactFormat"')) throw new SyntaxError("Canonical evidence artifact failed bounded lossless decoding.");
    throw error;
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (!(typeof record.artifactFormat === "string" && record.artifactFormat.startsWith("certscore.canonical-evidence-artifact.")) &&
    !((record.encoding === "gzip_base64" || record.encoding === "brotli_base64") && Object.hasOwn(record, "payload"))) return value;
  try {
    if (Buffer.byteLength(text) > CANONICAL_ARTIFACT_MAX_DECODED_BYTES) throw Error();
    const packet = envelope.parse(value);
    if (text.trim() !== JSON.stringify(packet)) throw Error();
    const packed = Buffer.from(packet.payload, "base64");
    if (packed.toString("base64") !== packet.payload) throw Error();
    const decoded = packet.encoding === "gzip_base64"
      ? gunzipSync(packed, { maxOutputLength: packet.decodedSizeBytes })
      : brotliDecompressSync(packed, { maxOutputLength: packet.decodedSizeBytes,
          params: { [constants.BROTLI_DECODER_PARAM_LARGE_WINDOW]: 0 } });
    if (decoded.length !== packet.decodedSizeBytes || sha(decoded) !== packet.decodedSha256) throw Error();
    const result: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded));
    if (!result || typeof result !== "object" || Object.hasOwn(result, "artifactFormat") ||
      !supportedSchema((result as { schemaVersion?: unknown }).schemaVersion)) throw Error();
    if (options.schemaValidation !== "caller") canonicalEvidenceBundleSchema.parse(result);
    // Validation must not discard unknown/additive JSON facts. Callers retain
    // exactly the same parse semantics as the ordinary legacy representation.
    return result;
  } catch {
    // Preserve permanent JSON-failure handling without echoing any payload.
    throw new SyntaxError("Canonical evidence artifact failed bounded lossless decoding.");
  }
}
