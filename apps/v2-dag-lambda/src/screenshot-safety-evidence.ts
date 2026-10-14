import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  consentControlVisualComparisonSchema,
  normalizeConsentControlText,
  verifyConsentControlInspection,
  type CanonicalEvidenceBundle,
} from "@certscore/contracts";

export const MAX_REVIEW_IMAGE_BYTES = 8 * 1024 * 1024;

export async function readBoundedImage(filePath: string): Promise<Buffer> {
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Buffer | undefined;
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_REVIEW_IMAGE_BYTES) {
      throw new Error("Image size outside review bounds.");
    }
    bytes = Buffer.alloc(metadata.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new Error("Incomplete image file.");
      offset += bytesRead;
    }
    const extra = Buffer.alloc(1);
    if ((await file.read(extra, 0, 1, offset)).bytesRead !== 0) throw new Error("Image changed during read.");
    const result = bytes;
    bytes = undefined;
    return result;
  } finally {
    bytes?.fill(0);
    await file.close();
  }
}

export function imageDigest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Grants review time only, never a consent assessment or permission to serve an
 * image. Unrelated partial controls remain partial. The caller's absolute deadline
 * includes this bounded local verification; no capture or remote call is added. */
export async function verifiedPairedScreenshot(input: {
  artifactRoot: string;
  bundle: CanonicalEvidenceBundle;
}): Promise<{ path: string; sha256: string } | null> {
  let bytes: Buffer | undefined;
  try {
    const geometryPath = path.join(input.artifactRoot, "ConsentControlGeometryEvidence.json");
    if ((await stat(geometryPath)).size > 2 * 1024 * 1024) return null;
    const geometryBytes = await readFile(geometryPath);
    if (geometryBytes.length > 2 * 1024 * 1024) return null;
    const geometry = object(JSON.parse(geometryBytes.toString("utf8")));
    if (!geometry || geometry.artifactVersion !== "consent_control_geometry.v1" ||
      geometry.sourceScanner !== "consent_control_geometry_diagnostic") return null;
    const parsed = consentControlVisualComparisonSchema.safeParse(geometry.visualComparison);
    if (!parsed.success) return null;
    const visual = parsed.data;
    const identity = object(geometry.documentIdentity);
    if (!identity?.source || identity.token !== visual.documentToken) return null;
    const screenshot = input.bundle.screenshots.find(row => row.path === visual.screenshotArtifactRef &&
      row.url === geometry.pageUrl && row.documentIdentity?.source === identity.source &&
      row.documentIdentity?.token === identity.token && row.consentStateAtTime === "pre_consent" &&
      row.retentionStatus !== "withheld" && row.displayStatus !== "withheld" &&
      ["primary_full_page", "primary_viewport_fallback"].includes(row.captureMethod ?? ""));
    const root = path.resolve(input.artifactRoot) + path.sep;
    if (!screenshot || !path.resolve(screenshot.path).startsWith(root) ||
      geometry.screenshotArtifactRef !== screenshot.path) return null;
    const captureSkewMs = Math.abs(Date.parse(String(geometry.capturedAt)) -
      Date.parse(input.bundle.startedAt) - screenshot.capturedAtMs);
    const viewport = object(geometry.viewport);
    if (!Number.isFinite(captureSkewMs) || captureSkewMs !== visual.captureSkewMs ||
      viewport?.width !== visual.imageWidth || viewport.height !== visual.imageHeight) return null;
    const observation = input.bundle.consentUiObservations.find(row =>
      row.captureStatus === "observed" && row.layerInspected === "first_layer" &&
      ["partial", "complete_with_controls"].includes(row.inventoryOutcome ?? "") &&
      row.documentUrl === screenshot.url && row.documentIdentity?.source === identity.source &&
      row.documentIdentity?.token === identity.token &&
      row.captureDiagnostics?.completedChannels.includes("dom_inventory") &&
      row.captureDiagnostics.completedChannels.includes("geometry") &&
      !row.captureDiagnostics.failedChannels.some(channel => channel === "dom_inventory" || channel === "geometry") &&
      !row.captureDiagnostics.timedOutChannels.some(channel => channel === "dom_inventory" || channel === "geometry"));
    if (!observation) return null;
    const inspection = verifyConsentControlInspection(geometry.controlInspection, geometry.candidates);
    if (!inspection || inspection.structuralCoverage !== "complete" || inspection.reasonCodes.length) return null;
    // Observation selectors are surface-relative (e.g. "button"), while
    // geometry selectors include their container. They need not be identical.
    // Exact candidate/geometry/image binding below remains authoritative.
    const candidates = (geometry.candidates as unknown[]).map(object);
    for (const [side, action] of [[visual.accept, "accept_all"], [visual.reject, "reject_all"]] as const) {
      const matches = candidates.filter(row => row?.candidateId === side.candidateId);
      const candidate = matches[0];
      const frame = object(candidate?.frameContext);
      const bounds = object(candidate?.boundingBox);
      const proof = inspection.candidates.find(row => row.candidateId === side.candidateId);
      if (matches.length !== 1 || !candidate || candidate.actionType !== action ||
        candidate.layer !== "first_layer" || candidate.decisionStatus !== "confirmed_visible" ||
        candidate.enabled !== true || candidate.intersectsViewport !== true ||
        candidate.screenshotArtifactRef !== screenshot.path || frame?.frameKind !== "main_frame" ||
        frame.frameUrl !== screenshot.url || proof?.role !== "decision" || proof.unresolvedIntents.length ||
        !bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every((value, i) => value === side.bounds[i]) ||
        !observation.controls.some(row => row.actionType === action && row.visible !== false &&
          (row.layer === undefined || row.layer === "first_layer") &&
          row.tagName === candidate.tagName && normalizeConsentControlText(row.label) === normalizeConsentControlText(String(candidate.label ?? "")))) return null;
    }
    bytes = await readBoundedImage(screenshot.path);
    if (imageDigest(bytes) !== visual.screenshotSha256) return null;
    // The producer currently creates PNG screenshots. Validate their dimensions
    // against the comparison rather than granting extra time to a mismatched file.
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.readUInt32BE(16) !== visual.imageWidth || bytes.readUInt32BE(20) !== visual.imageHeight) return null;
    return { path: screenshot.path, sha256: visual.screenshotSha256 };
  } catch {
    return null;
  } finally {
    bytes?.fill(0);
  }
}
