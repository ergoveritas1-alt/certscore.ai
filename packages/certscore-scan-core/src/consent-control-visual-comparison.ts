import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { consentControlVisualComparisonSchema, CONSENT_VISUAL_COMPARISON_VERSION, verifyConsentControlInspection, verifiedMainFrameVisualCapture,
  type ConsentControlVisualComparison, type ScreenshotArtifact, type ConsentUiObservation } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact, ConsentControlCandidateEvidence } from "./consent-control-geometry.js";

import { comparisonPair, geometryCaptureTimingValid } from "./consent-control-comparison-pair.js";
export { comparisonPair } from "./consent-control-comparison-pair.js";

export type ConsentVisualCaptureState = { frameRevision: number; framesStable: boolean; terminalPair?: boolean };

/** A post-image inventory cannot prove the banner was present in that image.
 * This only selects an early analysis opportunity; pixel and frame proof remain required. */
export function preCaptureConsentPairObserved(observation: ConsentUiObservation, geometry: ConsentControlGeometryArtifact, image: ScreenshotArtifact) {
  const pair=comparisonPair(geometry);
  if (!pair || observation.documentUrl!==image.url || observation.documentIdentity?.source!=="cdp_loader_id" ||
      observation.documentIdentity.token!==image.documentIdentity?.token || !Number.isFinite(observation.observedAtMs) ||
      observation.observedAtMs>image.capturedAtMs || image.capturedAtMs-observation.observedAtMs>500) return false;
  return (["accept", "reject"] as const).every(intent=>{
    const candidate=pair[intent], controls=observation.controls.filter(control=>control.actionType===`${intent}_all` && control.visible===true);
    return controls.length===1 && Boolean(candidate.selectorHint) && controls[0]!.selectorHint===candidate.selectorHint &&
      controls[0]!.label.trim()===candidate.label.trim();
  });
}

function geometryFacts(geometry: ConsentControlGeometryArtifact) {
  const { capturedAt: _time, captureTiming: _timing, screenshotArtifactRef: _image, visualComparison: _visual, ...facts } = geometry;
  return { ...facts, candidates: geometry.candidates.map(candidate => {
    const { screenshotArtifactRef: _reference, ...control } = candidate;
    return control;
  }) };
}

/** Preserve the whole earlier capture, never transplant its pixels onto newer
 * geometry. Both captures must describe exactly the same inspected facts. */
export function retainPairedConsentVisualCapture(input: {
  previous: ConsentControlGeometryArtifact; current: ConsentControlGeometryArtifact;
  screenshots: ScreenshotArtifact[]; scanStartedAtMs: number;
  previousState: ConsentVisualCaptureState; currentState: ConsentVisualCaptureState;
}): ConsentControlGeometryArtifact {
  const { previous, current } = input;
  if (!geometryCaptureTimingValid(previous) || !geometryCaptureTimingValid(current)) return current;
  if (!input.previousState.framesStable || !input.currentState.framesStable ||
      !Number.isInteger(input.previousState.frameRevision) || input.previousState.frameRevision < 0 ||
      input.previousState.frameRevision !== input.currentState.frameRevision || current.visualComparison ||
      !previous.visualComparison || !isDeepStrictEqual(geometryFacts(previous), geometryFacts(current))) return current;
  if ([previous, current].some(geometry =>
    verifyConsentControlInspection(geometry.controlInspection, geometry.candidates)?.structuralCoverage !== "complete")) return current;
  const visual = consentControlVisualComparisonSchema.safeParse(previous.visualComparison);
  const image = input.screenshots.find(s => s.artifactId === "screenshot_pre_consent_settled" &&
    s.path === previous.screenshotArtifactRef && s.url === previous.pageUrl && s.consentStateAtTime === "pre_consent" &&
    s.captureMethod === "primary_viewport_fallback" && s.documentIdentity?.source === "cdp_loader_id" &&
    s.documentIdentity.token === previous.documentIdentity?.token &&
    s.retentionStatus !== "withheld" && s.displayStatus !== "withheld");
  const pair = comparisonPair(previous);
  if (!visual.success || !image || !pair || visual.data.documentToken !== previous.documentIdentity?.token ||
      visual.data.imageWidth !== previous.viewport.width || visual.data.imageHeight !== previous.viewport.height ||
      !(["accept", "reject"] as const).every(intent => {
        const candidate = pair[intent], measurement = visual.data[intent];
        return measurement.candidateId === candidate.candidateId && isDeepStrictEqual(measurement.bounds,
          [candidate.boundingBox.x, candidate.boundingBox.y, candidate.boundingBox.width, candidate.boundingBox.height]);
      }) || visual.data.screenshotArtifactRef !== image.path ||
      visual.data.captureSkewMs !== Math.abs(Date.parse(previous.capturedAt) - input.scanStartedAtMs - image.capturedAtMs) ||
      !Number.isFinite(Date.parse(current.capturedAt)) || Date.parse(current.capturedAt) < Date.parse(previous.capturedAt)) return current;
  return previous;
}

type Rgb = [number, number, number];
const round = (n: number) => Math.round(n * 1000) / 1000;
const luminance = (rgb: Rgb) => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);


/** Same 4-bit colour bins, pixels and first-seen tie rule as the original
 * Map/string implementation. Fixed integer histograms avoid per-pixel keys
 * and sorting without changing sampling, thresholds or evidence. */
export function dominantQuantizedRgb(pixels: Rgb[]) {
  const histogram = createRgbHistogram();
  for (const rgb of pixels) addHistogramPixel(histogram, rgb[0], rgb[1], rgb[2]);
  return dominantHistogramRgb(histogram);
}

function createRgbHistogram() {
  return {counts: new Uint32Array(4096), sums: new Uint32Array(4096 * 3), order: [] as number[], total: 0};
}

function addHistogramPixel(histogram: ReturnType<typeof createRgbHistogram>, red: number, green: number, blue: number) {
  const key = (red >> 4) * 256 + (green >> 4) * 16 + (blue >> 4);
  if (histogram.counts[key] === 0) histogram.order.push(key);
  histogram.counts[key]!++;
  histogram.sums[key * 3]! += red;
  histogram.sums[key * 3 + 1]! += green;
  histogram.sums[key * 3 + 2]! += blue;
  histogram.total++;
}

function dominantHistogramRgb({counts, sums, order, total}: ReturnType<typeof createRgbHistogram>) {
  let winner: number | undefined;
  for (const key of order) if (winner === undefined || counts[key]! > counts[winner]!) winner = key;
  if (winner === undefined) return undefined;
  const count = counts[winner]!;
  return {rgb: [sums[winner * 3]! / count, sums[winner * 3 + 1]! / count, sums[winner * 3 + 2]! / count] as Rgb,
    fraction: count / total};
}


export type ConsentVisualComparisonDiagnostic = {
  status: "deferred" | "no_budget" | "not_eligible" | "retained" | "timed_out" | "unavailable";
  reason?: "capture_frames_changed" | "pair_not_unique" | "pair_occluded" | "image_binding_incomplete";
  artifactId?: string; allowanceMs: number; elapsedMs: number;
};

function pairedImage(geometry: ConsentControlGeometryArtifact, screenshots: ScreenshotArtifact[], scanStartedAtMs: number) {
  const image = screenshots.find(s => s.path === geometry.screenshotArtifactRef && s.url === geometry.pageUrl &&
    s.consentStateAtTime === "pre_consent" && s.documentIdentity?.token === geometry.documentIdentity?.token &&
    s.documentIdentity?.source === "cdp_loader_id" && s.retentionStatus !== "withheld" && s.displayStatus !== "withheld");
  if (!image || geometry.controlInspection?.structuralCoverage !== "complete" && !verifiedMainFrameVisualCapture(geometry)) return undefined;
  const skew = Math.abs(Date.parse(geometry.capturedAt) - scanStartedAtMs - image.capturedAtMs);
  return Number.isInteger(skew) && skew <= 500 ? image : undefined;
}

/** Spend the existing shared 80ms once, on a complete terminal pair. The
 * protected settled capture can be terminal when explicitly committed by the
 * caller; all other interim images stay deferred. Never decode twice or
 * extend the allowance when a later capture becomes eligible. */
export function createConsentVisualComparisonCollector(screenshots: ScreenshotArtifact[], scanStartedAtMs: number,
  remainingModuleBudgetMs: () => number, measure = withConsentControlVisualComparison,
  onDiagnostic?: (value: ConsentVisualComparisonDiagnostic) => void) {
  let budgetMs = 80;
  return async (geometry: ConsentControlGeometryArtifact, state?: ConsentVisualCaptureState) => {
    const startedAtMs = Date.now();
    const image = screenshots.find(image => image.path === geometry.screenshotArtifactRef);
    const authoritative = image && (
      ["screenshot_pre_consent_geometry_proof", "screenshot_pre_consent_packet_recovery"].includes(image.artifactId) ||
      ["screenshot_pre_consent_settled", "screenshot_pre_consent_cmp_controls"].includes(image.artifactId) && state?.terminalPair === true && state.framesStable === true);
    const diagnostic = (status: ConsentVisualComparisonDiagnostic["status"], allowanceMs = 0, reason?: ConsentVisualComparisonDiagnostic["reason"]) =>
      onDiagnostic?.({ status, ...(reason ? { reason } : {}), artifactId: image?.artifactId, allowanceMs, elapsedMs: Math.max(0, Date.now() - startedAtMs) });
    if (!authoritative) { diagnostic("deferred"); return geometry; }
    const mainScope = verifiedMainFrameVisualCapture(geometry);
    if (state?.framesStable === false && (!mainScope || mainScope.frameRevisionBeforeImage !== state.frameRevision)) { diagnostic("not_eligible", 0, "capture_frames_changed"); return geometry; }
    if (!comparisonPair(geometry)) {
      const occluded = ["accept_all", "reject_all"].some(action => geometry.candidates.some(c => c.actionType === action && c.layer === "first_layer" && c.decisionStatus === "covered"));
      diagnostic("not_eligible", 0, occluded ? "pair_occluded" : "pair_not_unique"); return geometry;
    }
    if (!pairedImage(geometry, screenshots, scanStartedAtMs)) { diagnostic("not_eligible", 0, "image_binding_incomplete"); return geometry; }
    const allowanceMs = Math.min(budgetMs, remainingModuleBudgetMs());
    if (allowanceMs <= 0) { diagnostic("no_budget"); return geometry; }
    // Reserve before awaiting so overlapping or recovery callbacks cannot
    // launch a second decode while the first native operation is finishing.
    budgetMs = 0;
    const result = await measure(geometry, screenshots, startedAtMs + allowanceMs, scanStartedAtMs);
    const timedOut = Date.now() >= startedAtMs + allowanceMs;
    diagnostic(timedOut ? "timed_out" : result.visualComparison ? "retained" : "unavailable", allowanceMs);
    return timedOut ? geometry : result;
  };
}

/** Existing producer-owned files only; timeout cannot mutate a later packet. */
export async function withConsentControlVisualComparison(geometry: ConsentControlGeometryArtifact,
  screenshots: ScreenshotArtifact[], deadlineAtMs: number, scanStartedAtMs: number): Promise<ConsentControlGeometryArtifact> {
  const screenshot = pairedImage(geometry, screenshots, scanStartedAtMs);
  if (!screenshot || !comparisonPair(geometry) || Date.now() >= deadlineAtMs) return geometry;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const measurement = await Promise.race([
      (async () => {
        if ((await stat(screenshot.path)).size > 8 * 1024 * 1024 || Date.now() >= deadlineAtMs) return undefined;
        return measureConsentControlVisualComparison({ geometry, screenshotBytes: await readFile(screenshot.path), deadlineAtMs,
          screenshotCapturedAtMs: scanStartedAtMs + screenshot.capturedAtMs });
      })(),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), Math.max(1, deadlineAtMs - Date.now())); }),
    ]);
    return measurement ? { ...geometry, visualComparison: measurement } : geometry;
  } catch { return geometry; }
  finally { if (timer) clearTimeout(timer); }
}

/** Bounded analysis of an existing, same-session viewport; never captures or clicks. */
export async function measureConsentControlVisualComparison(input: {
  geometry: ConsentControlGeometryArtifact; screenshotBytes: Buffer; screenshotCapturedAtMs: number; deadlineAtMs?: number;
}): Promise<ConsentControlVisualComparison | undefined> {
  const { geometry, screenshotBytes } = input;
  const captureSkewMs = Math.abs(Date.parse(geometry.capturedAt) - input.screenshotCapturedAtMs);
  if (screenshotBytes.length > 8 * 1024 * 1024 || !geometry.documentIdentity?.token || !geometry.screenshotArtifactRef ||
      !Number.isInteger(captureSkewMs) || captureSkewMs > 500 ||
      geometry.controlInspection?.structuralCoverage !== "complete" && !verifiedMainFrameVisualCapture(geometry) || Date.now() >= (input.deadlineAtMs ?? Infinity)) return undefined;
  const pair = comparisonPair(geometry);
  if (!pair) return undefined;
  try {
    // Full-page, clipped, scaled and device-pixel-ratio captures need a separately
    // verified transform. Do not guess one from image dimensions.
    const decoder = sharp(screenshotBytes, { limitInputPixels: 4_000_000 });
    const metadata = await decoder.metadata();
    if (metadata.width !== geometry.viewport.width || metadata.height !== geometry.viewport.height ||
        Date.now() >= (input.deadlineAtMs ?? Infinity)) return undefined;
    const boxes = [pair.accept.boundingBox, pair.reject.boundingBox];
    if (boxes.some(({x, y, width, height}) => x < 12 || y < 12 ||
        x + width + 12 > metadata.width! || y + height + 12 > metadata.height! ||
        width < 24 || height < 16 || width * height > 150_000)) return undefined;
    // Decode one exact analysis rectangle containing every original sample,
    // including the full surrounding ring. No resize, resampling, extra decode
    // or cropped artifact. The original full image remains retained and hashed.
    const left = Math.floor(Math.min(...boxes.map(box => box.x))) - 12;
    const top = Math.floor(Math.min(...boxes.map(box => box.y))) - 12;
    const crop = {left, top,
      width: Math.ceil(Math.max(...boxes.map(box => box.x + box.width))) + 12 - left,
      height: Math.ceil(Math.max(...boxes.map(box => box.y + box.height))) + 12 - top};
    const { data, info } = await decoder.extract(crop).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    if (info.width !== crop.width || info.height !== crop.height || info.channels !== 3 ||
        Date.now() >= (input.deadlineAtMs ?? Infinity)) return undefined;
    const measure = (candidate: ConsentControlCandidateEvidence) => {
      const { x, y, width, height } = candidate.boundingBox;
      const left = Math.floor(x), top = Math.floor(y), right = Math.ceil(x + width), bottom = Math.ceil(y + height);
      const interior = createRgbHistogram(), background = createRgbHistogram();
      const emphasisOffsets: number[] = [];
      // Subsample large interiors; per-control work stays under 40k pixels.
      const stride = Math.max(1, Math.ceil(Math.sqrt(width * height / 20_000)));
      for (let py = top - 12; py < bottom + 12; py++) for (let px = left - 12; px < right + 12; px++) {
        const at = ((py - crop.top) * info.width + px - crop.left) * 3;
        if (px >= left + 4 && px < right - 4 && py >= top + 4 && py < bottom - 4) {
          if ((px - left) % stride === 0 && (py - top) % stride === 0)
            addHistogramPixel(interior, data[at]!, data[at + 1]!, data[at + 2]!);
        } else if (px < left - 9 || px >= right + 9 || py < top - 9 || py >= bottom + 9)
          addHistogramPixel(background, data[at]!, data[at + 1]!, data[at + 2]!);
        else if (px < left || px >= right || py < top || py >= bottom) emphasisOffsets.push(at);
      }
      const fill = dominantHistogramRgb(interior), surrounding = dominantHistogramRgb(background);
      if (!fill || !surrounding || fill.fraction < 0.6 || surrounding.fraction < 0.6 || !emphasisOffsets.length) return undefined;
      const a = luminance(fill.rgb), b = luminance(surrounding.rgb);
      let changed = 0;
      for (const at of emphasisOffsets) if (Math.hypot(data[at]! - surrounding.rgb[0],
        data[at + 1]! - surrounding.rgb[1], data[at + 2]! - surrounding.rgb[2]) >= 60) changed++;
      return { candidateId: candidate.candidateId, bounds: [x, y, width, height] as [number, number, number, number],
        fillContrast: round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)),
        outerEmphasisFraction: round(changed / emphasisOffsets.length), backgroundUniformity: round(surrounding.fraction), interiorUniformity: round(fill.fraction) };
    };
    const accept = measure(pair.accept), reject = measure(pair.reject);
    if (!accept || !reject || Date.now() >= (input.deadlineAtMs ?? Infinity)) return undefined;
    const mainFrameCapture = geometry.controlInspection?.structuralCoverage === "complete" ? undefined : verifiedMainFrameVisualCapture(geometry);
    const parsed = consentControlVisualComparisonSchema.safeParse({ version: mainFrameCapture ? "consent_control_visual_comparison.v2" : CONSENT_VISUAL_COMPARISON_VERSION,
      ...(mainFrameCapture ? {mainFrameCapture} : {}),
      documentToken: geometry.documentIdentity.token, screenshotArtifactRef: geometry.screenshotArtifactRef,
      screenshotSha256: createHash("sha256").update(screenshotBytes).digest("hex"), imageWidth: metadata.width, imageHeight: metadata.height, captureSkewMs, accept, reject });
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; }
}
