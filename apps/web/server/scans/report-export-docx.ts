import { executiveDocxChildren, executiveBookmark, type ExecutiveDocxBranding } from "./report-executive-docx";
import {
  AlignmentType, Bookmark, BorderStyle, Document, ExternalHyperlink, Footer, HeadingLevel,
  PageNumber, Packer, Paragraph, SectionType, LineRuleType, Table, TableCell, TableLayoutType, TableRow,
  TextRun, WidthType, type ParagraphChild,
} from "docx";
import type { CanonicalReportExport } from "./report-export";
import { canonicalReportDocumentContent, type PdfLine } from "./report-export-pdf";
import { pdfLocalDate, pdfTimeZone } from "./report-pdf-time";
import { assertPublicReportPdfContent, publicReportPdfBaseUrl } from "./report-pdf-public-safety";
import { pdfRegionLabel, pdfTestedUrl } from "./report-pdf-reader";
import { reportStatusLabel } from "../../lib/scans/report-status-presentation";
import { REPORT_EXPORT_DISCLAIMER } from "./report-export-footer";

export const REPORT_DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PAGE_WIDTH = 9360; // Letter with one-inch horizontal margins, in twips.
const border = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" };

function paragraph(text: string, options: { heading?: typeof HeadingLevel[keyof typeof HeadingLevel]; pageBreakBefore?: boolean; bold?: boolean; href?: string; keepNext?: boolean; bookmark?: string } = {}) {
  const textRun = new TextRun({ text: reportStatusLabel(text), bold: options.bold });
  const children: ParagraphChild[] = options.href && publicReportPdfBaseUrl(options.href)
    ? [new ExternalHyperlink({ link: options.href, children: [textRun] })] : options.bookmark ? [new Bookmark({ id: executiveBookmark(options.bookmark), children: [textRun] })] : [textRun];
  return new Paragraph({ children, heading: options.heading, pageBreakBefore: options.pageBreakBefore,
    spacing: { after: options.heading ? 140 : 100 }, keepNext: Boolean(options.heading || options.keepNext), widowControl: true });
}

function evidenceTable(lines: PdfLine[]) {
  const header = lines[0]!;
  const columns = header.sourceCells?.length ?? header.cells?.length ?? 1;
  const proportions = header.columnWidths ?? Array.from({ length: columns }, () => 1);
  const sum = proportions.reduce((a, b) => a + b, 0);
  const widths = proportions.map(value => Math.round(value / sum * PAGE_WIDTH));
  widths[widths.length - 1]! += PAGE_WIDTH - widths.reduce((a, b) => a + b, 0);
  return new Table({ width: { size: PAGE_WIDTH, type: WidthType.DXA }, columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: lines.filter(line => !line.tableRowContinuation).map((line, index) => new TableRow({
      tableHeader: index === 0,
      // Keep ordinary evidence rows intact. Very long retained cells may span
      // pages rather than overflow or lose their terminal evidence.
      cantSplit: (line.sourceCells ?? line.cells?.map(cell => cell.join(" ")) ?? [line.text])
        .every((text, column) => text.length / Math.max(12, (widths[column] ?? widths[0]!) / 90) < 36),
      children: (line.sourceCells ?? line.cells?.map(cell => cell.join(" ")) ?? [line.text]).map((text, column) => new TableCell({
        width: { size: widths[column] ?? widths[0]!, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        shading: index === 0 ? { fill: "E8EEF5" } : undefined,
        borders: { top: border, bottom: border, left: border, right: border },
        children: [new Paragraph({ children: [new TextRun({ text: reportStatusLabel(text), bold: index === 0, size: 18 })],
          spacing: { after: 40 }, widowControl: true })],
      })),
    })),
  });
}

/** An editable Word report over the same canonical content as the native PDF.
 * No raw observations, score recomputation, active content or remote assets. */
export async function renderCanonicalReportDocx(source: CanonicalReportExport, options: { appUrl?: string; timeZone?: string } & ExecutiveDocxBranding = {}) {
  const { report, lines } = canonicalReportDocumentContent(source, options.appUrl);
  const timeZone = pdfTimeZone(options.timeZone) ?? "UTC";
  const url = pdfTestedUrl(report);
  const heading = `${report.scan.domainHostname ?? "Website"} privacy and accessibility report`;
  const brandName = options.brandName?.trim().slice(0, 64) || "CertScore.ai";
  const metadata = [heading, report.reviewFocusLabel, url ?? "", brandName, report.scan.id];
  assertPublicReportPdfContent(metadata);
  const summaryChildren = await executiveDocxChildren(report, timeZone, { ...options, brandName });
  const footer = () => new Footer({ children: [
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 220, lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: `${brandName} | `, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 16 })] }),
    new Paragraph({ spacing: { after: 0, line: 220, lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: `Scan ID: ${report.scan.id}`, size: 15 })] }),
    new Paragraph({ spacing: { after: 0, line: 220, lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: REPORT_EXPORT_DISCLAIMER, size: 15 })] }),
  ] });
  const children: Array<Paragraph | Table> = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.kind === "tableHeader") {
      const table = [line];
      while (lines[index + 1]?.kind === "tableRow" && lines[index + 1]?.tableId === line.tableId) table.push(lines[++index]!);
      children.push(evidenceTable(table), paragraph(""));
      continue;
    }
    if (line.overview) {
      children.push(...line.overview.metrics.map(metric => paragraph(`${metric.label}: ${metric.value}`)));
      continue;
    }
    if (line.chart) {
      children.push(paragraph(line.chart.title, { bold: true }), ...line.chart.bars.map(bar => paragraph(`${bar.label}: ${bar.value}`)));
      continue;
    }
    if (line.timeline) {
      children.push(...line.timeline.map(event => paragraph(`${event.label}: ${event.milliseconds} ms`)));
      continue;
    }
    if (["image", "imageFocus", "fullImageSlice", "chapterNavigation", "tableRow"].includes(line.kind ?? "")) continue;
    const heading = line.chapterTitle ? HeadingLevel.HEADING_1
      : ["section", "itemHeading", "appendixStage"].includes(line.kind ?? "") ? HeadingLevel.HEADING_2 : undefined;
    children.push(paragraph(line.text, { heading, bold: line.bold, href: line.href, keepNext: Boolean(line.keepWithNextHeight || line.keepWithNextParagraph),
      bookmark: line.destination, pageBreakBefore: Boolean(line.chapterTitle && line.pageBreakBefore && line.destination !== "findings") }));
  }
  const document = new Document({ creator: "CertScore.ai", title: heading, description: `${report.reviewFocusLabel} scan report`,
    styles: { default: { document: { run: { font: "Arial", size: 21, color: "000000" }, paragraph: { spacing: { line: 280 } } },
      title: { run: { font: "Arial", size: 40, bold: true, color: "000000" } },
      heading1: { run: { font: "Arial", size: 28, bold: true, color: "000000" } },
      heading2: { run: { font: "Arial", size: 23, bold: true, color: "000000" } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 432, bottom: 1080, left: 720, right: 720, footer: 240 } } },
      footers: { default: footer() }, children: summaryChildren },
    { properties: { type: SectionType.NEXT_PAGE, page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1440, right: 1440, footer: 240 } } },
      footers: { default: footer() }, children }],
  });
  return Packer.toBuffer(document);
}
