import { z } from "zod";
import type { DomSnapshotArtifact } from "./index";
import { siteMetadataSchema } from "./site-metadata";

const MAX_RUNTIME_CMS_METADATA_BYTES = 4096;

export const runtimeCmsMetadataSnapshotSchema = z.object({
  contractVersion: z.literal("certscore.runtime-cms-metadata.v1"),
  runtimeSourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  terminalArtifactId: z.string().min(1).max(240),
  terminalCapturedAtMs: z.number().int().nonnegative(),
  artifactId: z.string().min(1).max(240),
  capturedAtMs: z.number().int().nonnegative(),
  url: z.string().url().max(2000),
  documentIdentity: z.object({
    source: z.literal("cdp_loader_id"),
    token: z.string().min(1).max(160),
  }).strict(),
  consentStateAtTime: z.literal("pre_consent"),
  siteMetadata: siteMetadataSchema,
}).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_RUNTIME_CMS_METADATA_BYTES,
  "Runtime CMS metadata exceeds its byte limit.");

type RuntimeCmsMetadataSnapshot = z.infer<typeof runtimeCmsMetadataSnapshotSchema>;
type DocumentAnchor = Pick<DomSnapshotArtifact, "artifactId" | "url" | "documentIdentity" | "capturedAtMs" | "consentStateAtTime">;

function sameRuntimeDocument(source: DocumentAnchor, terminal: DocumentAnchor): boolean {
  return source.url === terminal.url && source.consentStateAtTime === "pre_consent" &&
    terminal.consentStateAtTime === "pre_consent" && source.documentIdentity?.source === "cdp_loader_id" &&
    terminal.documentIdentity?.source === "cdp_loader_id" && Boolean(source.documentIdentity.token) &&
    source.documentIdentity.token === terminal.documentIdentity.token;
}

function precedesTerminal(
  source: DocumentAnchor,
  terminal: DocumentAnchor,
  durationMs: number,
): boolean {
  return source.artifactId !== terminal.artifactId && sameRuntimeDocument(source, terminal) &&
    Number.isInteger(source.capturedAtMs) && source.capturedAtMs >= 0 &&
    Number.isInteger(terminal.capturedAtMs) && source.capturedAtMs < terminal.capturedAtMs &&
    terminal.capturedAtMs <= durationMs;
}

export function runtimeCmsMetadataMatchesTerminal(
  companion: RuntimeCmsMetadataSnapshot,
  terminal: DocumentAnchor,
  durationMs: number,
  runtimeSourceSha256: string,
): boolean {
  return companion.runtimeSourceSha256 === runtimeSourceSha256 &&
    companion.terminalArtifactId === terminal.artifactId &&
    companion.terminalCapturedAtMs === terminal.capturedAtMs &&
    precedesTerminal(companion, terminal, durationMs);
}

/** Keep the terminal snapshot as the runtime anchor. A compact earlier
 * observation can supply CMS metadata only for the same pre-consent loader. */
export function retainRuntimeCmsMetadataSnapshot(
  snapshots: readonly DomSnapshotArtifact[],
  terminal: DomSnapshotArtifact | undefined,
  durationMs: number,
  runtimeSourceSha256: string,
): RuntimeCmsMetadataSnapshot | undefined {
  if (!terminal || terminal.siteMetadata || snapshots.some(row => row !== terminal &&
    row.capturedAtMs === terminal.capturedAtMs &&
    (!sameRuntimeDocument(row, terminal) || row.siteMetadata !== undefined))) return;
  const candidates = snapshots.filter(row => row.siteMetadata && precedesTerminal(row, terminal, durationMs))
    .sort((a, b) => b.capturedAtMs - a.capturedAtMs);
  const candidate = candidates[0];
  if (!candidate || snapshots.some(row => row !== candidate &&
    (row.capturedAtMs === candidate.capturedAtMs ||
      (row.capturedAtMs > candidate.capturedAtMs && row.capturedAtMs < terminal.capturedAtMs &&
        !sameRuntimeDocument(row, terminal))))) return;
  const { artifactId, capturedAtMs, url, documentIdentity, consentStateAtTime, siteMetadata } = candidate;
  return runtimeCmsMetadataSnapshotSchema.safeParse({
    contractVersion: "certscore.runtime-cms-metadata.v1",
    runtimeSourceSha256, terminalArtifactId: terminal.artifactId, terminalCapturedAtMs: terminal.capturedAtMs,
    artifactId, capturedAtMs, url, documentIdentity, consentStateAtTime, siteMetadata,
  }).data;
}
