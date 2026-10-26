import { verifiedNarrowGeometry } from "./gdpr-narrow-geometry";
import { retainedParagraphHtmlMatchesText } from "./gdpr-narrow-paragraph";
import {
  GDPR_NARROW_POSTURE_VERSION, explicitAdvertisingBrowsingAssent, explicitAdvertisingBrowsingAssentV2, classifyConsentPreferenceCategoryLabel,
  gdprNarrowPostureSchema,
  type CanonicalEvidenceBundle, type GdprNarrowIssue,
} from "@certscore/contracts";

const canonicalUrl = (value: string) => { try { const u = new URL(value); u.hash = ""; return u.href; } catch { return ""; } };
type Geometry = { documentIdentity?: { token?: string }; pageUrl?: string;
  containers?: Array<{ textExcerpt?: string; htmlExcerpt?: string; intersectsViewport?: boolean; layer?: string;
    containerId?: string; selectorHint?: string; boundingBox?: { width: number; height: number } }>;
  candidates?: Array<{ label?: string; intersectsViewport?: boolean; boundingBox?: { width: number; height: number } }> };
type Source = { verificationStatus: string; sha256?: string };

/** No browser/model/IO work. Only verified original bytes may reach this
 * materializer. Only the two active consent observations are materialized. */
export function projectGdprNarrowPosture(input: {
  bundle: CanonicalEvidenceBundle; source?: Source; documentUrl: string | null;
  geometry?: Record<string, unknown> | null;
  resolvePolicyText?: (observationId: string) => string | null;
  noticeReview?: unknown;
}) {
  const { bundle, source } = input;
  if (source?.verificationStatus !== "verified" || !source.sha256?.match(/^[a-f0-9]{64}$/) ||
    !input.documentUrl || bundle.scanNoGoAssessment?.decision === "no_go") return null;
  const targetUrl = canonicalUrl(input.documentUrl);
  if (!targetUrl) return null;
  const issues: GdprNarrowIssue[] = [];
  const verifiedGeometry = verifiedNarrowGeometry(input.geometry, bundle.scanId);
  const geometry = verifiedGeometry?.geometry as Geometry | null | undefined;
  for (const observation of bundle.consentUiObservations.slice(0, 8)) {
    if (observation.captureStatus !== "observed" || observation.layerInspected !== "first_layer" ||
      !observation.documentIdentity?.token || observation.documentIdentity.token !== geometry?.documentIdentity?.token ||
      canonicalUrl(observation.documentUrl ?? "") !== targetUrl || canonicalUrl(geometry?.pageUrl ?? "") !== targetUrl ||
      !Number.isFinite(observation.observedAtMs) || bundle.consentInteractionEvents.length > 0) continue;
    const mechanismId = `${targetUrl}#${observation.documentIdentity.token}`;
    const base = { sourceUrl: targetUrl, evidenceRef: observation.observationId, mechanismId,
      documentToken: observation.documentIdentity.token, observedAtMs: observation.observedAtMs!,
      geometrySha256: verifiedGeometry!.sha256, geometrySizeBytes: verifiedGeometry!.sizeBytes };
    const labels = observation.precheckedOptionalPurposeLabels.filter(label => classifyConsentPreferenceCategoryLabel(label) === "optional");
    if (!issues.some(i => i.kind === "optional_defaults") && observation.defaultToggleStatesObserved === true &&
      observation.nonEssentialDefaultsOff === false && labels.length > 0 &&
      observation.precheckedOptionalPurposeCount >= labels.length && labels.every(label => geometry?.candidates?.some(c =>
        c.label === label && c.intersectsViewport === true && c.boundingBox && c.boundingBox.width > 0 && c.boundingBox.height > 0))) {
      issues.push({ ...base, kind: "optional_defaults", method: "observed_optional_states.v1",
        optionalLabels: [...new Set(labels)].slice(0, 10), evidenceText: `Selected optional purposes: ${labels.join(", ")}`.slice(0, 1200) });
    }
    // Preserve the original typed-observation path and its source gates. Its
    // current semantic check rejects generic terms/policy assent; old v1 reads
    // remain unchanged. Existing geometry classifications are not relabelled.
    const text = observation.textExcerpt ?? "";
    const legacyMatch = explicitAdvertisingBrowsingAssent(text);
    if (!issues.some(i => i.kind === "implied_consent") && legacyMatch && explicitAdvertisingBrowsingAssentV2(text) && geometry?.containers?.some(c =>
      c.intersectsViewport === true && c.textExcerpt?.includes(legacyMatch.clause) && explicitAdvertisingBrowsingAssentV2(c.textExcerpt))) {
      issues.push({ ...base, kind: "implied_consent", method: "explicit_advertising_assent.v1", evidenceText: text.slice(0, 1200) });
    }
    // Prefer one short original paragraph over a page-leading UI excerpt.
    // Never join siblings, hidden preference content or policy text to a banner.
    const paragraph = geometry?.containers?.slice(0, 128).filter(c =>
      c.layer === "first_layer" && c.intersectsViewport === true &&
      c.boundingBox && Number.isFinite(c.boundingBox.width) && c.boundingBox.width > 0 &&
      Number.isFinite(c.boundingBox.height) && c.boundingBox.height > 0 &&
      c.containerId && c.containerId.length <= 160 && c.selectorHint && c.selectorHint.length <= 1000 &&
      c.textExcerpt && c.textExcerpt.length <= 1200 && explicitAdvertisingBrowsingAssentV2(c.textExcerpt) &&
      retainedParagraphHtmlMatchesText(c.htmlExcerpt, c.textExcerpt))
      .sort((a, b) => a.textExcerpt!.length - b.textExcerpt!.length)[0];
    if (!issues.some(i => i.kind === "implied_consent") && paragraph) {
      issues.push({ ...base, kind: "implied_consent", method: "explicit_advertising_assent.v2-paragraph",
        geometryContainerId: paragraph.containerId!, geometryContainerSelector: paragraph.selectorHint!,
        evidenceText: paragraph.textExcerpt! });
    }
  }

  // Candidates 3–5 are inactive even when an explicit reviewed notice is supplied.
  // Keep the input shape for diagnostic compatibility; never materialize omissions.
  const assessment = gdprNarrowPostureSchema.safeParse({ contractVersion: GDPR_NARROW_POSTURE_VERSION,
    scanId: bundle.scanId, sourceBundleSha256: source.sha256, targetUrl,
    issues });
  return assessment.success ? assessment.data : null;
}
