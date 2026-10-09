import type { BrowserDocumentIdentity, ScreenshotArtifact } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";

const SCREENSHOT_PRIORITY = [
  "screenshot_pre_consent_geometry_proof",
  "screenshot_pre_consent_packet_recovery",
  "screenshot_pre_consent_cmp_controls",
  "screenshot_pre_consent_cmp_empty",
  "screenshot_pre_consent_settled",
  "screenshot_pre_consent_full_page",
  "screenshot_pre_consent",
];

function sameDocument(
  screenshot: ScreenshotArtifact,
  document: { documentIdentity?: BrowserDocumentIdentity; pageUrl: string },
) {
  return Boolean(document.documentIdentity?.token &&
    screenshot.documentIdentity?.source === document.documentIdentity.source &&
    screenshot.documentIdentity.token === document.documentIdentity.token &&
    screenshot.url === document.pageUrl && screenshot.consentStateAtTime === "pre_consent");
}

/** Selection only: never schedules a replacement capture or upgrades visual safety. */
export function preferredPreConsentScreenshotRef(
  screenshots: ScreenshotArtifact[],
  document?: { documentIdentity?: BrowserDocumentIdentity; pageUrl: string },
): string | undefined {
  const eligible = document ? screenshots.filter((screenshot) => sameDocument(screenshot, document)) : screenshots;
  for (const artifactId of SCREENSHOT_PRIORITY) {
    const screenshot = eligible.find((candidate) => candidate.artifactId === artifactId);
    if (screenshot) return screenshot.path;
  }
  return eligible[0]?.path;
}

/** Keep the packet and its current visible candidates bound to one verified loader. */
export function bindConsentGeometryScreenshot(
  geometry: ConsentControlGeometryArtifact,
  screenshot: ScreenshotArtifact,
): boolean {
  if (!sameDocument(screenshot, geometry)) return false;
  const previousRef = geometry.screenshotArtifactRef;
  geometry.screenshotArtifactRef = screenshot.path;
  for (const candidate of geometry.candidates) {
    if (candidate.layer === "first_layer" && candidate.decisionStatus === "confirmed_visible" &&
        (!candidate.screenshotArtifactRef || candidate.screenshotArtifactRef === previousRef)) {
      candidate.screenshotArtifactRef = screenshot.path;
    }
  }
  return true;
}
