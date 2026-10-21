import { projectConsentVisualProminence } from "@certscore/contracts";
import type { CanonicalReportExport } from "./report-export";

export type PdfVisualFocus = {
  crop: { x: number; y: number; width: number; height: number };
  controls: Array<{ intent: "accept" | "reject"; bounds: [number, number, number, number] }>;
};

export function pdfConsentVisualFocus(report: CanonicalReportExport, image: { width: number; height: number; sha256: string }): PdfVisualFocus | null {
  const assessment = report.consentControlAssessment;
  const projection = projectConsentVisualProminence(assessment);
  if (!projection || assessment?.scan.scanId !== report.scan.id) return null;
  const comparison = projection.comparison;
  if (comparison.screenshotSha256 !== image.sha256 || comparison.imageWidth !== image.width || comparison.imageHeight !== image.height) return null;
  const controls = (["accept", "reject"] as const).map(intent => ({ intent, bounds: comparison[intent].bounds }));
  const left = Math.max(0, Math.min(...controls.map(control => control.bounds[0])) - 24);
  const top = Math.max(0, Math.min(...controls.map(control => control.bounds[1])) - 48);
  const right = Math.min(image.width, Math.max(...controls.map(control => control.bounds[0] + control.bounds[2])) + 24);
  const bottom = Math.min(image.height, Math.max(...controls.map(control => control.bounds[1] + control.bounds[3])) + 24);
  return { crop: { x: left, y: top, width: right - left, height: bottom - top }, controls };
}
