import { consentControlAssessmentSchema, consentControlVisualComparisonSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { z } from "zod";
import { consentBannerCropSchema, type ConsentBannerCrop } from "../../lib/scans/visual-evidence";

const boxSchema = z.object({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(), height: z.number().finite().positive() });
const geometrySchema = z.object({
  documentIdentity: z.object({ token: z.string() }),
  screenshotArtifactRef: z.string(),
  visualComparison: consentControlVisualComparisonSchema,
  candidates: z.array(z.object({ candidateId: z.string(), containerId: z.string().optional() })).max(200),
  containers: z.array(z.object({ containerId: z.string(), role: z.string().optional(), layer: z.string(), intersectsViewport: z.boolean(), boundingBox: boxSchema })).max(200),
});
const fileName = (path: string) => path.split("/").at(-1);

/** Presentation metadata from the already verified consent packet. This never
 * determines banner availability, control states, prominence or findings. */
export function deriveConsentBannerCrop(input: {
  assessment: unknown;
  geometry: unknown;
  screenshot: NonNullable<CanonicalEvidenceBundle["screenshots"]>[number];
}): ConsentBannerCrop | null {
  const assessment = consentControlAssessmentSchema.safeParse(input.assessment);
  const geometry = geometrySchema.safeParse(input.geometry);
  const shot = input.screenshot;
  if (!assessment.success || !geometry.success || shot.consentStateAtTime !== "pre_consent" ||
    shot.retentionStatus !== "available" || shot.displayStatus === "withheld") return null;
  const a = assessment.data, g = geometry.data, visual = a.visualComparison;
  if (!visual || a.visualEvidence?.status !== "available" || !a.visualEvidence.artifactRefs.includes(shot.artifactId) ||
    a.document.identityStatus !== "matched" || a.document.canonicalDocumentToken !== visual.documentToken ||
    g.documentIdentity.token !== visual.documentToken || shot.documentIdentity?.token !== visual.documentToken ||
    fileName(shot.path) !== fileName(visual.screenshotArtifactRef) ||
    g.screenshotArtifactRef !== visual.screenshotArtifactRef ||
    JSON.stringify(g.visualComparison) !== JSON.stringify(visual)) return null;
  const accept = g.candidates.find(c => c.candidateId === visual.accept.candidateId);
  const reject = g.candidates.find(c => c.candidateId === visual.reject.candidateId);
  if (!accept?.containerId || accept.containerId !== reject?.containerId) return null;
  const anchor = g.containers.find(c => c.containerId === accept.containerId && c.layer === "first_layer" && c.intersectsViewport);
  if (!anchor) return null;
  const box = anchor.boundingBox;
  // Controls may sit in an inner action cluster. Prefer the enclosing semantic
  // dialog so the crop also retains the banner header, close control and footer.
  const container = g.containers.filter(c => c.layer === "first_layer" && c.intersectsViewport &&
    ["dialog", "alertdialog"].includes(c.role ?? "") && c.boundingBox.x <= box.x && c.boundingBox.y <= box.y &&
    c.boundingBox.x + c.boundingBox.width >= box.x + box.width && c.boundingBox.y + c.boundingBox.height >= box.y + box.height)
    .sort((a, b) => a.boundingBox.width * a.boundingBox.height - b.boundingBox.width * b.boundingBox.height)[0];
  if (!container) return null;
  const b = container.boundingBox;
  if (b.x + b.width > visual.imageWidth || b.y + b.height > visual.imageHeight ||
    [visual.accept, visual.reject].some(({ bounds: [x, y, w, h] }) =>
      x < b.x || y < b.y || x + w > b.x + b.width || y + h > b.y + b.height)) return null;
  const crop = consentBannerCropSchema.safeParse({ version: "consent_banner_crop.v1", ...b,
    imageWidth: visual.imageWidth, imageHeight: visual.imageHeight, screenshotSha256: visual.screenshotSha256 });
  return crop.success ? crop.data : null;
}
