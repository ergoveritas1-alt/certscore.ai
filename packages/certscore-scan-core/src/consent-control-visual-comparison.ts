import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { consentControlVisualComparisonSchema, CONSENT_VISUAL_COMPARISON_VERSION, verifyConsentControlInspection, classifyConsentControlLabel, normalizeConsentControlText,
  type ConsentControlVisualComparison, type ScreenshotArtifact } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact, ConsentControlCandidateEvidence } from "./consent-control-geometry.js";

export type ConsentVisualCaptureState = { frameRevision: number; framesStable: boolean };

function geometryFacts(geometry: ConsentControlGeometryArtifact) {
  const { capturedAt: _time, screenshotArtifactRef: _image, visualComparison: _visual, ...facts } = geometry;
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

/** Pure selection over retained observations. Does not establish inventory completeness,
 * screenshot binding, action authorization, or a prominence finding. */
export function comparisonPair(geometry: ConsentControlGeometryArtifact) {
  const eligible = geometry.candidates.filter(c => c.layer === "first_layer" && c.decisionStatus === "confirmed_visible" &&
    c.enabled && c.frameContext.frameKind === "main_frame" && c.frameContext.frameUrl === geometry.pageUrl &&
    !c.actionableControlCandidateId);
  const pairs = eligible.filter(c => c.actionType === "accept_all").flatMap(accept =>
    eligible.filter(c => c.actionType === "reject_all").flatMap(reject => {
      const a = accept.boundingBox, r = reject.boundingBox;
      // One clearly paired action row or column; never compare a banner control with an
      // unrelated page CTA or choose the most asymmetric of several pairs.
      const overlap = Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top);
      const gap = Math.max(a.left, r.left) - Math.min(a.right, r.right);
      const sharedSurface = geometry.containers.some(c => c.layer === "first_layer" &&
        [a, r].every(box => box.left >= c.boundingBox.left && box.right <= c.boundingBox.right &&
          box.top >= c.boundingBox.top && box.bottom <= c.boundingBox.bottom));
      const horizontalOverlap = Math.min(a.right, r.right) - Math.max(a.left, r.left);
      const verticalGap = Math.max(a.top, r.top) - Math.min(a.bottom, r.bottom);
      const sameRow = overlap >= Math.min(a.height, r.height) * 0.8 && gap >= 0 && gap <= 600;
      const alignedCenters = Math.abs((a.left + a.right) / 2 - (r.left + r.right) / 2) <= Math.max(16, Math.min(a.width, r.width) * 0.2);
      const sameColumn = alignedCenters && horizontalOverlap >= Math.min(a.width, r.width) * 0.8 && verticalGap >= 0 && verticalGap <= 240;
      return sharedSurface && (sameRow || sameColumn)
        ? [{ accept, reject }] : [];
    }));
  if (pairs.length) return pairs.length === 1 ? pairs[0] : undefined;

  // Separated refusal links need semantic and surface proof instead of proximity.
  // Never pick the smallest Reject or an arbitrary pair from several decisions.
  const accepts = eligible.filter(c => c.actionType === "accept_all");
  const rejects = eligible.filter(c => c.actionType === "reject_all");
  if (accepts.length !== 1 || rejects.length !== 1) return undefined;
  const accept = accepts[0]!, reject = rejects[0]!;
  const control = (c: ConsentControlCandidateEvidence) => c.consentContextConfirmed === true &&
    c.intersectsViewport && !c.clippedByScrollableAncestor &&
    (c.tagName !== "a" || c.linkDestination === "same_document") &&
    (c.tagName === "button" || c.role === "button" || c.tagName === "a");
  if (!control(accept) || !control(reject)) return undefined;
  const refusal = classifyConsentControlLabel({ label: reject.label, ariaLabel: reject.ariaLabel,
    title: reject.title, value: reject.value, hasConsentContext: true, usage: "observation",
    linkRole: reject.role, linkDestination: reject.linkDestination });
  if (refusal.intent !== "reject" || !["direct", "equivalent"].includes(refusal.matchStrength ?? "") ||
      refusal.variant && refusal.variant !== "necessary_only") return undefined;
  // A bare/partial reject verb can refer to an individual service. Require a
  // complete multiword canonical label or the named CMP's canonical global target.
  // Ignore only decorative symbols (e.g. the arrow after Qobuz's visible label).
  const words = (s: string) => normalizeConsentControlText(s).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const term = words(refusal.matchedTerm ?? "");
  const completeLabel = term.split(" ").length >= 2 && words(reject.label) === term;
  const definition = KNOWN_CMP_REGISTRY.find(c => c.canonicalName === geometry.cmp.name);
  const canonicalTarget = geometry.cmp.detected && definition?.rejectControlSelectors?.includes(reject.selectorHint) === true;
  if (!completeLabel && !canonicalTarget) return undefined;
  const contains = (outer: ConsentControlCandidateEvidence["boundingBox"], inner: ConsentControlCandidateEvidence["boundingBox"]) =>
    inner.width > 0 && inner.height > 0 && inner.left >= outer.left && inner.right <= outer.right &&
    inner.top >= outer.top && inner.bottom <= outer.bottom;
  const parents = [accept, reject].map(c => geometry.containers.find(p => p.containerId === c.containerId &&
    p.layer === "first_layer" && p.intersectsViewport && contains(p.boundingBox, c.boundingBox)));
  if (parents.some(p => !p)) return undefined;
  const a = accept.boundingBox, r = reject.boundingBox;
  if (Math.min(a.right, r.right) > Math.max(a.left, r.left) &&
      Math.min(a.bottom, r.bottom) > Math.max(a.top, r.top)) return undefined;
  const sharedSurface = geometry.containers.some(c => c.layer === "first_layer" && c.intersectsViewport &&
    c.boundingBox.width * c.boundingBox.height < geometry.viewport.width * geometry.viewport.height * 0.95 &&
    parents.every(p => contains(c.boundingBox, p!.boundingBox)));
  return sharedSurface ? { accept, reject } : undefined;
}

/** One shared 80ms allowance across existing recaptures, inside the module budget. */
export function createConsentVisualComparisonCollector(screenshots: ScreenshotArtifact[], scanStartedAtMs: number,
  remainingModuleBudgetMs: () => number, measure = withConsentControlVisualComparison) {
  let budgetMs = 80;
  // Early captures may use half; retain at least half for the authoritative
  // geometry proof/recovery image. This redistributes the existing allowance.
  let earlyBudgetMs = 40;
  let paired: { geometry: ConsentControlGeometryArtifact; state: ConsentVisualCaptureState } | undefined;
  return async (geometry: ConsentControlGeometryArtifact, state?: ConsentVisualCaptureState) => {
    const startedAtMs = Date.now();
    const authoritative = screenshots.some(image => image.path === geometry.screenshotArtifactRef &&
      ["screenshot_pre_consent_geometry_proof", "screenshot_pre_consent_packet_recovery"].includes(image.artifactId));
    const allowanceMs = Math.min(budgetMs, authoritative ? budgetMs : earlyBudgetMs, remainingModuleBudgetMs());
    if (allowanceMs <= 0) { paired = undefined; return geometry; }
    try {
      if (paired && state) {
        const retained = retainPairedConsentVisualCapture({ previous: paired.geometry, current: geometry,
          previousState: paired.state, currentState: state, screenshots, scanStartedAtMs });
        if (retained !== geometry && Date.now() < startedAtMs + allowanceMs) return structuredClone(retained);
      }
      // Any intervening unbound, changed or incomplete capture invalidates reuse.
      paired = undefined;
      const result = await measure(geometry, screenshots, startedAtMs + allowanceMs, scanStartedAtMs);
      if (state?.framesStable && result !== geometry && result.visualComparison &&
          screenshots.some(s => s.artifactId === "screenshot_pre_consent_settled" && s.path === result.screenshotArtifactRef)) {
        paired = { geometry: structuredClone(result), state: { ...state } };
      }
      return result;
    } finally {
      const spentMs = Math.max(1, Date.now() - startedAtMs);
      budgetMs = Math.max(0, budgetMs - spentMs);
      if (!authoritative) earlyBudgetMs = Math.max(0, earlyBudgetMs - spentMs);
    }
  };
}

/** Existing producer-owned files only; timeout cannot mutate a later packet. */
export async function withConsentControlVisualComparison(geometry: ConsentControlGeometryArtifact,
  screenshots: ScreenshotArtifact[], deadlineAtMs: number, scanStartedAtMs: number): Promise<ConsentControlGeometryArtifact> {
  const screenshot = screenshots.find(s => s.path === geometry.screenshotArtifactRef && s.url === geometry.pageUrl &&
    s.consentStateAtTime === "pre_consent" && s.documentIdentity?.token === geometry.documentIdentity?.token &&
    s.documentIdentity?.source === "cdp_loader_id" && s.retentionStatus !== "withheld" && s.displayStatus !== "withheld");
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
      geometry.controlInspection?.structuralCoverage !== "complete" || Date.now() >= (input.deadlineAtMs ?? Infinity)) return undefined;
  const pair = comparisonPair(geometry);
  if (!pair) return undefined;
  try {
    const { data, info } = await sharp(screenshotBytes, { limitInputPixels: 4_000_000 }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    // Full-page, clipped, scaled and device-pixel-ratio captures need a separately
    // verified transform. Do not guess one from image dimensions.
    if (info.width !== geometry.viewport.width || info.height !== geometry.viewport.height || info.channels !== 3 ||
        Date.now() >= (input.deadlineAtMs ?? Infinity)) return undefined;
    const pixel = (x: number, y: number): Rgb => {
      const at = (y * info.width + x) * 3;
      return [data[at]!, data[at + 1]!, data[at + 2]!];
    };
    const mode = (pixels: Rgb[]) => {
      const groups = new Map<string, { count: number; sum: Rgb }>();
      for (const rgb of pixels) {
        const key = rgb.map(v => Math.floor(v / 16)).join(":");
        const group = groups.get(key) ?? { count: 0, sum: [0, 0, 0] };
        group.count++; rgb.forEach((v, i) => { group.sum[i]! += v; }); groups.set(key, group);
      }
      const winner = [...groups.values()].sort((a, b) => b.count - a.count)[0];
      return winner ? { rgb: winner.sum.map(v => v / winner.count) as Rgb, fraction: winner.count / pixels.length } : undefined;
    };
    const measure = (candidate: ConsentControlCandidateEvidence) => {
      const { x, y, width, height } = candidate.boundingBox;
      if (x < 12 || y < 12 || x + width + 12 > info.width || y + height + 12 > info.height || width < 24 || height < 16 || width * height > 150_000) return undefined;
      const left = Math.floor(x), top = Math.floor(y), right = Math.ceil(x + width), bottom = Math.ceil(y + height);
      const interior: Rgb[] = [], background: Rgb[] = [], emphasis: Rgb[] = [];
      // Subsample large interiors; per-control work stays under 40k pixels.
      const stride = Math.max(1, Math.ceil(Math.sqrt(width * height / 20_000)));
      for (let py = top - 12; py < bottom + 12; py++) for (let px = left - 12; px < right + 12; px++) {
        if (px >= left + 4 && px < right - 4 && py >= top + 4 && py < bottom - 4) {
          if ((px - left) % stride === 0 && (py - top) % stride === 0) interior.push(pixel(px, py));
        } else if (px < left - 9 || px >= right + 9 || py < top - 9 || py >= bottom + 9) background.push(pixel(px, py));
        else if (px < left || px >= right || py < top || py >= bottom) emphasis.push(pixel(px, py));
      }
      const fill = mode(interior), surrounding = mode(background);
      if (!fill || !surrounding || fill.fraction < 0.6 || surrounding.fraction < 0.6 || !emphasis.length) return undefined;
      const a = luminance(fill.rgb), b = luminance(surrounding.rgb);
      const changed = emphasis.filter(rgb => Math.hypot(...rgb.map((v, i) => v - surrounding.rgb[i]!)) >= 60).length;
      return { candidateId: candidate.candidateId, bounds: [x, y, width, height] as [number, number, number, number],
        fillContrast: round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)),
        outerEmphasisFraction: round(changed / emphasis.length), backgroundUniformity: round(surrounding.fraction), interiorUniformity: round(fill.fraction) };
    };
    const accept = measure(pair.accept), reject = measure(pair.reject);
    if (!accept || !reject || Date.now() >= (input.deadlineAtMs ?? Infinity)) return undefined;
    const parsed = consentControlVisualComparisonSchema.safeParse({ version: CONSENT_VISUAL_COMPARISON_VERSION,
      documentToken: geometry.documentIdentity.token, screenshotArtifactRef: geometry.screenshotArtifactRef,
      screenshotSha256: createHash("sha256").update(screenshotBytes).digest("hex"), imageWidth: info.width, imageHeight: info.height, captureSkewMs, accept, reject });
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; }
}
