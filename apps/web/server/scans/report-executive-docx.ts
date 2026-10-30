import sharp from "sharp";
import { AlignmentType, BorderStyle, HeadingLevel, HeightRule, ImageRun, LineRuleType, InternalHyperlink, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType } from "docx";
import type { CanonicalReportExport } from "./report-export";
import { executiveFindingExcerpt, reportExecutiveSummary } from "./report-executive-summary";
import { pdfLocalDate } from "./report-pdf-time";
import { pdfRegionLabel } from "./report-pdf-reader";
import { wrapPdfText } from "./report-pdf-fonts";
import scoreGlyphs from "./assets/report-score-glyphs.json";
import { normalizeCompanyLogo } from "../company/logo-image";
import { normalizeReportHeaderTheme, type ReportHeaderTheme } from "../../lib/report-header-theme";

export type ExecutiveDocxBranding = { brandName?: string; brandLogo?: { body: Buffer; contentType: string } | null; headerTheme?: ReportHeaderTheme };

export const executiveBookmark = (id: string) => `report_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
const ink = "111827", muted = "4B5563", accent = "0B6E99", orange = "8A3B04";
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const rule = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" };
const rings = new Map<string, Promise<Buffer>>();
/** Static licensed outlines, so the AWS image needs no font installation. */
function glyphText(text: string, size: number, baseline: number, color: string) {
  const glyphs = scoreGlyphs.glyphs as Record<string, { advance: number; path: string }>;
  const advance = [...text].reduce((total, character) => total + glyphs[character]!.advance, 0);
  const scale = Math.min(size / scoreGlyphs.unitsPerEm, 88 / Math.max(1, advance));
  const width = [...text].reduce((total, character) => total + glyphs[character]!.advance, 0);
  let offset = 0;
  const paths = [...text].map(character => {
    const glyph = glyphs[character]!;
    const path = `<path d="${glyph.path}" transform="translate(${offset} 0)"/>`;
    offset += glyph.advance;
    return path;
  }).join("");
  return `<g fill="${color}" transform="translate(${64 - width * scale / 2} ${baseline}) scale(${scale} ${-scale})">${paths}</g>`;
}
export function executiveScoreRingSvg(score: number | null) {
  const circumference = 2 * Math.PI * 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 128 128"><circle cx="64" cy="64" r="50" fill="white" stroke="#E5E7EB" stroke-width="10"/><circle cx="64" cy="64" r="50" fill="none" stroke="#0B6E99" stroke-width="10" stroke-dasharray="${circumference * (score ?? 0) / 100} ${circumference}" transform="rotate(-90 64 64)"/>${glyphText(String(score ?? "N/A"), 40, 69, "#111827")}${glyphText("of 100", 14, 87, "#4B5563")}</svg>`;
}
function ring(score: number | null) {
  const key = String(score);
  let cached = rings.get(key);
  if (!cached) {
    cached = sharp(Buffer.from(executiveScoreRingSvg(score))).png().toBuffer();
    if (rings.size < 102) rings.set(key, cached); // Keep process-local memory bounded.
  }
  return cached;
}
function p(text: string, size = 19, bold = false, color = ink, after = 50) {
  return new Paragraph({ run: { size, font: "Arial" }, children: [new TextRun({ text, size, bold, color, font: "Arial" })],
    spacing: { before: 0, after, line: Math.ceil(size * 12), lineRule: LineRuleType.EXACT }, widowControl: true });
}
function details(target: string) {
  return new Paragraph({ run: { size: 16, font: "Arial" }, children: [new InternalHyperlink({ anchor: executiveBookmark(target), children: [new TextRun({ text: "Details", color: accent, size: 16, font: "Arial" })] })], spacing: { before: 0, after: 0, line: 192, lineRule: LineRuleType.EXACT } });
}
function cell(children: Array<Paragraph | Table>, width: number, fill?: string, border = false, leftColor?: string) {
  return new TableCell({ width: { size: width, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP,
    margins: { top: 90, bottom: 70, left: 120, right: 120 }, shading: fill ? { fill } : undefined,
    borders: { top: border ? rule : none, bottom: border ? rule : none, right: border ? rule : none, left: leftColor ? { style: BorderStyle.SINGLE, size: 18, color: leftColor } : border ? rule : none }, children });
}
function table(widths: number[], rows: TableCell[][], headerHeights?: number[]) {
  return new Table({ width: { size: widths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    margins: headerHeights ? { top: 0, bottom: 0, left: 0, right: 0 } : undefined,
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: rows.map((children, index) => new TableRow({ cantSplit: true, height: headerHeights ? { value: headerHeights[index]!, rule: HeightRule.EXACT } : undefined, children })) });
}

/** Editable summary text/cards/metrics; the score diagram is the sole graphic. */
export async function executiveDocxChildren(report: CanonicalReportExport, timeZone: string, branding: ExecutiveDocxBranding = {}) {
  const m = reportExecutiveSummary(report);
  const dark = normalizeReportHeaderTheme(branding.headerTheme) === "black";
  const headerInk = dark ? "FFFFFF" : ink, headerMuted = dark ? "CAD6E3" : muted, headerFill = dark ? "000000" : "FFFFFF";
  // Explicit spacing avoids reader defaults adding paragraph gaps in Pages.
  const headerText = (text: string, size: number, bold: boolean, color: string, after = 50) => new Paragraph({ run: { size, font: "Arial" },
    children: [new TextRun({ text, size, bold, color, font: "Arial" })],
    spacing: { before: 0, after, line: Math.ceil(size * 12), lineRule: LineRuleType.EXACT } });
  // One flat grid: nested tables reflow inconsistently in Word/preview readers.
  const headerCell = (children: Paragraph[], width: number, columnSpan = 1, rowSpan = 1) => new TableCell({ width: { size: width, type: WidthType.DXA }, columnSpan, rowSpan,
    margins: { top: 0, bottom: 0, left: 0, right: 0 }, shading: { fill: headerFill }, borders: { top: none, bottom: none, left: none, right: none }, verticalAlign: VerticalAlign.TOP, children });
  const blank = () => new Paragraph({ run: { size: 2 }, children: [new TextRun({ text: "", size: 2 })], spacing: { before: 0, after: 0, line: 1, lineRule: LineRuleType.EXACT } });
  const domain = executiveFindingExcerpt(report.scan.domainHostname ?? "Website report", 70);
  const heading = new Paragraph({ run: { size: domain.length > 42 ? 32 : 54, font: "Arial" }, heading: HeadingLevel.TITLE, children: [new TextRun({ text: domain, font: "Arial", size: domain.length > 42 ? 32 : 54, bold: true, color: headerInk })],
    spacing: { before: 0, after: 148, line: domain.length > 42 ? 400 : 640, lineRule: LineRuleType.AT_LEAST } });
  let logoParagraph: Paragraph | null = null;
  if (branding.brandLogo) {
    const normalized = await normalizeCompanyLogo(branding.brandLogo.body, branding.brandLogo.contentType);
    let logo = await sharp(normalized).flatten({ background: "#FFFFFF" }).resize({ width: 160, height: 80, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    if (logo.data.length > 16384) logo = await sharp(normalized).flatten({ background: "#FFFFFF" }).resize({ width: 80, height: 40, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    if (logo.data.length > 16384) throw new Error("Workspace report logo exceeds the Word image limit.");
    // 80 pt logo box, shared with PDF (25% larger than its previous 64 pt box).
    const scale = Math.min((80 * 4 / 3) / logo.info.width, (80 * 4 / 3) / logo.info.height);
    logoParagraph = new Paragraph({ run: { size: 2 }, spacing: { before: 60, after: 0 }, children: [new ImageRun({ type: "png", data: logo.data,
      transformation: { width: logo.info.width * scale, height: logo.info.height * scale },
      altText: { title: branding.brandName || "Workspace logo", description: "Workspace report logo", name: "Workspace logo" } })] });
  }
  const identityWidth = logoParagraph ? 5120 : 7000;
  const workspace = branding.brandName?.trim().slice(0, 64) || "CertScore.ai";
  const framework = `${report.reviewFocusLabel} | ${m.scoreScope}`;
  const date = pdfLocalDate(report.scan.completedAt, timeZone);
  const origination = `Scan origination: ${pdfRegionLabel(report.scan.scanFrom)}`;
  // Pages expands auto-height rows even with zero cell margins. Match the PDF's
  // vertical rhythm explicitly, reserving more height when editable text wraps.
  const extraLines = (value: string, width: number, size: number, bold = false) => Math.max(0, wrapPdfText(value, width - 8, size, bold).length - 1);
  const headerHeights = [480, 700 + extraLines(domain, identityWidth / 20, domain.length > 42 ? 16 : 27, true) * (domain.length > 42 ? 400 : 640),
    300 + extraLines(workspace, identityWidth / 20, 8.5) * 240,
    260 + extraLines(framework, identityWidth / 20, 8.5) * 240,
    260 + Math.max(extraLines(date, identityWidth / 20, 8.5), extraLines(origination, 190, 8.5)) * 240];
  const headerWidths = logoParagraph ? [1880, identityWidth, 2100, 1700] : [identityWidth, 2100, 1700];
  const scoreGraphic = new Paragraph({ run: { size: 2 }, alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: "png", data: await ring(m.score),
    transformation: { width: 88, height: 88 }, altText: { title: m.score === null ? "Score unavailable" : `Score ${m.score}/100`, description: m.rating, name: "Assessment score" } })], spacing: { before: 0, after: 0 } });
  const header = table(headerWidths, [
    [headerCell([headerText("Executive Summary", 32, true, headerInk, 74)], 10800, headerWidths.length)],
    [...(logoParagraph ? [headerCell([logoParagraph], 1880, 1, 3)] : []), headerCell([heading], identityWidth),
      headerCell([new Paragraph({ run: { size: 16, font: "Arial" }, children: [new TextRun({ text: "SCORE", size: 16, bold: true, color: headerMuted, font: "Arial" })],
        spacing: { before: 298, after: 100, line: 192, lineRule: LineRuleType.EXACT } }), headerText(m.rating, 20, true, headerInk, 0)], 2100, 1, 3),
      headerCell([scoreGraphic], 1700, 1, 3)],
    [headerCell([headerText(workspace, 17, false, headerMuted, 96)], identityWidth)],
    [headerCell([headerText(framework, 17, false, headerMuted)], identityWidth)],
    [...(logoParagraph ? [headerCell([blank()], 1880)] : []), headerCell([headerText(date, 17, false, headerMuted, 80)], identityWidth),
      headerCell([headerText(origination, 17, false, headerMuted, 80)], 3800, 2)],
  ], headerHeights);
  const children: Array<Paragraph | Table> = [header, new Paragraph({ run: { size: 2 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D1D5DB" } }, spacing: { before: 20, after: 100, line: 20, lineRule: LineRuleType.EXACT } })];
  const metricCells: TableCell[] = [];
  m.metrics.forEach((metric, index) => {
    if (index) metricCells.push(cell([p("", 2, false, ink, 0)], 160));
    const warm = metric.attention;
    metricCells.push(cell([p(metric.value, 34, true, warm ? orange : ink), p(metric.label, 18, true), p(executiveFindingExcerpt(metric.note, 80), 16, false, warm ? orange : muted, 0)], 2580, warm ? "FFF4E7" : "F3F4F6"));
  });
  children.push(table([2580, 160, 2580, 160, 2580, 160, 2580], [metricCells]), p("", 3, false, ink, 70),
    p(`Report findings | ${m.priorityCount} selected ${m.priorityCount === 1 ? "priority" : "priorities"}; ${m.findings.length} findings`, 22, true, ink, 90));
  const units = (value: string) => [...value].reduce((sum, character) => sum + (character.charCodeAt(0) > 255 ? 2 : /[MW]/.test(character) ? 1.4 : 1), 0);
  const budget = Math.max(140, 320 - Math.max(0, Math.ceil(units(domain) / 42) - 1) * 26);
  let used = 0, visible = 0;
  for (const finding of m.findings.slice(0, 4)) {
    const height = Math.max(60, Math.ceil(units(executiveFindingExcerpt(finding.title, 100)) / 76) * 12 + Math.ceil(units(executiveFindingExcerpt(finding.summary, 220)) / 85) * 11.5) + 14;
    if (visible && used + height > budget) break;
    visible++; used += height;
  }
  for (const [index, f] of m.findings.slice(0, visible).entries()) {
    const warm = ["medium", "high", "critical"].includes(f.impact.toLowerCase());
    children.push(table([600, 8000, 2200], [[cell([p(String(index + 1), 25, true)], 600, warm ? "FFFAF4" : "FFFFFF", false, warm ? "C96A15" : "9CA3AF"),
      cell([p(executiveFindingExcerpt(f.title, 100), 20, true, ink, 50), p(executiveFindingExcerpt(f.summary, 220), 18, false, muted, 0)], 8000, warm ? "FFFAF4" : "FFFFFF"),
      cell([p(f.priority ? "Selected priority" : f.status === "For information" ? "For information" : "Other finding", 16, true, f.priority ? orange : muted), p(`${f.impact[0]?.toUpperCase()}${f.impact.slice(1)} impact`, 16, true), p(f.confidence, 16, false, muted, 20), details(f.target)], 2200, warm ? "FFFAF4" : "FFFFFF")]]), p("", 2, false, ink, 60));
  }
  if (!m.findings.length) children.push(p("No priority findings selected. See the topic assessments and detailed evidence.", 18, false, muted, 100));
  if (m.findings.length > visible) children.push(p(`Showing ${visible} of ${m.findings.length} findings. All findings remain in Detailed evidence.`, 16, false, muted));
  children.push(p("Topic status", 22, true, ink, 80));
  for (let index = 0; index < m.topics.length; index += 4) {
    const cells: TableCell[] = [];
    for (let column = 0; column < 4; column++) {
      if (column) cells.push(cell([p("", 2, false, ink, 0)], 160));
      const topic = m.topics[index + column];
      cells.push(cell(topic ? [p(topic.title, 17, true), p(topic.status, 16, true, ["Review", "Manual check", "Limited", "Partial"].includes(topic.status) ? orange : accent, 0), details(topic.target)] : [p("", 2, false, ink, 0)], 2580, undefined, Boolean(topic)));
    }
    children.push(table([2580, 160, 2580, 160, 2580, 160, 2580], [cells]), p("", 2, false, ink, 50));
  }
  return children;
}
