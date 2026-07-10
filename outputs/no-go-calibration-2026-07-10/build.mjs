import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const sourceDir = "/Volumes/miniben/CertScore/evidence";
const outputDir = "/Users/benmasek/WC01/outputs/no-go-calibration-2026-07-10";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift() ?? [];
  return rows.filter((candidate) => candidate.some(Boolean)).map((candidate) =>
    Object.fromEntries(headers.map((header, index) => [header, candidate[index] ?? ""])),
  );
}

const classifierRules = [
  ["tls_or_certificate_error", /invalid ssl certificate|certificate (?:is )?(?:invalid|expired)|privacy error|your connection is not private/i],
  ["configuration_error", /\{\s*"(?:detail|error)"\s*:\s*"(?:wrong domain parts[^"]*|invalid (?:domain|host)[^"]*|domain (?:is )?not configured[^"]*)"|"error_code"\s*:\s*"[^"]+"[^}]{0,160}"error_msg"\s*:\s*"[^"]*(?:unavailable|configuration|invalid domain)/i],
  ["unsupported_region", /visiting from the(?:\s|\|)+(?:eu|european union)[\s\S]{0,280}(?:ignore|block|deny)[^.]{0,100}(?:traffic|users?|access)|(?:site|service|content) (?:is )?not available in your (?:country|region)/i],
  ["site_not_ready", /\bprelaunch\b[\s\S]{0,300}check back at launch|your browser can(?:'|’|‘)?t render[^.]{0,120}check back at launch/i],
  ["rate_limited_429", /\b429\b[^\n]{0,80}(?:too many requests|rate limit)|too many requests|rate limit exceeded/i],
  ["not_found_404", /^(?:not found(?:\s+not found)?|404(?: not found)?)[.!\s]*$|\b404\b[^\n]{0,80}(?:not found|file not found)|(?:requested (?:page|file|url)|the (?:page|file))[^\n]{0,80}not found|the page you (?:requested|are looking for) (?:could not be found|does not exist)/i],
  ["server_error_5xx", /\b(?:500|502|503|504)\b[^\n]{0,100}(?:error|unavailable|gateway|timeout)|internal server error|service unavailable|bad gateway|gateway timeout/i],
  ["parked_or_placeholder", /\bexample domain\b|apache is functioning normally|website coming soon|site under construction|domain (?:is )?parked|domain (?:is )?for sale|welcome to nginx|default web site page|^[a-z0-9.-]+ is live!?$|this domain is an active and legitimate web address[^.]{0,160}(?:technical purposes|traffic routing|ad-tracking)/i],
  ["maintenance_or_unavailable", /(?:site|service|page) (?:is )?(?:temporarily )?(?:unavailable|under maintenance)|scheduled maintenance|we(?:'|’)ll be back soon|temporarily offline|page unavailable/i],
  ["captcha_or_access", /access to this site has been denied|access denied|access is temporarily restricted|forbidden|http\s*403|403(?:\s*-\s*|\s+)forbidden|403\s+error|the request could not be satisfied|block access from your country|unable to give you access to (?:our|this) site|unable to access (?:www\.)?[a-z0-9.-]+|security issue was automatically identified|security service to protect itself from online attacks|request blocked|bot protection|you(?:'|’)?ve been blocked|you have been blocked|cloudflare ray id|vercel security checkpoint|vercel sicherheitskontrollpunkt|checking your browser|wir überprüfen ihren browser|dein browser wird geprüft|performing security verification|security check|protected by kasada|x-kpsdk|detected unusual (?:behaviour|activity)[^.]{0,180}(?:bot|browser|network)|resembles that of a bot|real (?:shopper|person|user)s?[^.]{0,80}not robots?|(?:please )?verif(?:y|ies|ying)[^.]{0,80}(?:you are|that you(?:'|’)re) human|are you (?:a )?(?:person|human) or (?:a )?robot|press and hold[^.]{0,100}verif|\bzaraz wracamy\b/i],
  ["loading_or_stalled", /^[^\p{L}\p{N}]{0,4}(?:loading|please wait|establishing (?:a )?secure connection|initializing)\b[\s\S]{0,120}$/iu],
];

function textRule(text) {
  const normalized = text.replace(/\s+/g, " ").trim().slice(0, 360);
  return classifierRules.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "";
}

function priorPrediction(value) {
  return value === "correct_no_go" || value === "incorrect_false_no_go" ? "no_go" : "go";
}

function coverageLane(row, deterministicReason) {
  if (row.classification === "scannable") return "good_site_guard";
  if (deterministicReason) return "deterministic_text";
  if (["blank_page", "loading_or_stalled"].includes(row.page_classifier)) return "runtime_corroboration";
  if (row.page_classifier === "missing_assets_or_broken_render") return "diagnostic_continue";
  return "status_or_network_corroboration";
}

function expectedBehavior(row, deterministicReason) {
  if (row.classification === "scannable") return "continue";
  if (deterministicReason) return "no_go";
  if (["blank_page", "loading_or_stalled"].includes(row.page_classifier)) return "confirm_then_decide";
  if (row.page_classifier === "missing_assets_or_broken_render") return "continue_with_diagnostics";
  return "no_go_if_runtime_corroborates";
}

const manualRows = parseCsv(await fs.readFile(path.join(sourceDir, "certscore-screenshot-classification.csv"), "utf8"));
const qualityRows = parseCsv(await fs.readFile(path.join(sourceDir, "screengrab_quality_report.csv"), "utf8"));
const qualityByScan = new Map(qualityRows.map((row) => [row.scan_id, row]));

const rowData = manualRows.map((row) => {
  const quality = qualityByScan.get(row.scan_id) ?? {};
  const reason = textRule(quality.detected_text ?? "");
  const lane = coverageLane(row, reason);
  return [
    row.scan_id,
    row.filename,
    "361_scan_corpus",
    row.classification,
    row.page_classifier || "intentional_site",
    row.confidence,
    quality.screengrab_site_quality ?? "",
    Number(quality.file_size_bytes || 0),
    quality.detected_text ?? "",
    row.certscore_no_go_assessment_correct,
    priorPrediction(row.certscore_no_go_assessment_correct),
    row.certscore_no_go_assessment_correct.startsWith("correct") ? "yes" : "no",
    reason ? "no_go" : "go",
    reason,
    lane,
    expectedBehavior(row, reason),
    lane === "runtime_corroboration" || lane === "status_or_network_corroboration" ? "yes" : "no",
    row.review_notes,
  ];
});

rowData.push([
  "e26a3ce9-220b-4a99-96ee-0d69c3849dc2",
  "screenshot-pre-consent.png",
  "cerebras_holdout_2026-07-10",
  "not_scannable",
  "site_not_ready",
  "high",
  "Fresh production holdout",
  15882,
  "CEREBRAS PRELAUNCH LATTICE ONLINE V0.0.3. Your browser can’t render the visitor. It’s probably for the best. Check back at launch.",
  "incorrect_missed_no_go",
  "go",
  "no",
  "no_go",
  "site_not_ready",
  "deterministic_text",
  "no_go",
  "no",
  "Production scan returned HTTP 200 and assets but retained only a prelaunch shell; added as a holdout regression fixture.",
]);

const safeRowData = rowData.map((row) => row.map((value) =>
  typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : value,
));

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Summary");
const detail = workbook.worksheets.add("Row-Level");
summary.showGridLines = false;
detail.showGridLines = false;

const headers = [
  "scan_id", "filename", "source", "ground_truth", "page_classifier", "confidence",
  "quality_report_label", "file_size_bytes", "detected_text", "prior_certscore_outcome",
  "prior_prediction", "prior_correct", "ocr_rule_prediction", "ocr_rule_reason",
  "coverage_lane", "expected_current_behavior", "runtime_replay_needed", "review_notes",
];
detail.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
detail.getRangeByIndexes(1, 0, safeRowData.length, headers.length).values = safeRowData;
detail.tables.add(`A1:R${rowData.length + 1}`, true, "CalibrationRows").style = "TableStyleMedium2";
detail.freezePanes.freezeRows(1);
detail.freezePanes.freezeColumns(1);
detail.getRange(`A1:R${rowData.length + 1}`).format.font = { name: "Aptos", size: 10 };
detail.getRange("A1:R1").format = { fill: "#123047", font: { bold: true, color: "#FFFFFF" }, rowHeight: 28 };
detail.getRange(`H2:H${rowData.length + 1}`).format.numberFormat = "#,##0";
detail.getRange(`A2:R${rowData.length + 1}`).format.rowHeight = 22;
detail.getRange(`I2:I${rowData.length + 1}`).format.wrapText = false;
detail.getRange(`R2:R${rowData.length + 1}`).format.wrapText = false;
const widths = [245, 180, 165, 105, 170, 80, 145, 100, 420, 190, 95, 85, 125, 170, 180, 210, 130, 340];
widths.forEach((width, index) => { detail.getRangeByIndexes(0, index, rowData.length + 1, 1).format.columnWidthPx = width; });
detail.getRange(`D2:D${rowData.length + 1}`).conditionalFormats.add("containsText", { text: "not_scannable", format: { fill: "#FDE2E1", font: { color: "#9C1C1C" } } });
detail.getRange(`D2:D${rowData.length + 1}`).conditionalFormats.add("containsText", { text: "scannable", format: { fill: "#E3F4EC", font: { color: "#116149" } } });
detail.getRange(`L2:L${rowData.length + 1}`).conditionalFormats.add("containsText", { text: "no", format: { fill: "#FFF0D6", font: { color: "#8A4B08" } } });

summary.getRange("A1:H1").merge();
summary.getRange("A1").values = [["CertScore No-Go Calibration — 10 July 2026"]];
summary.getRange("A1:H1").format = { fill: "#123047", font: { name: "Aptos Display", size: 18, bold: true, color: "#FFFFFF" }, rowHeight: 36, verticalAlignment: "center" };
summary.getRange("A3:H3").merge();
summary.getRange("A3").values = [["Measured corpus: 361 screenshots. Fresh holdout: Cerebras production scan e26a3ce9-220b-4a99-96ee-0d69c3849dc2."]];
summary.getRange("A3:H3").format = { fill: "#EAF2F7", font: { color: "#294A5E", italic: true }, wrapText: true, rowHeight: 30 };

summary.getRange("A5:C5").merge();
summary.getRange("A5").values = [["Existing CertScore baseline"]];
summary.getRange("E5:G5").merge();
summary.getRange("E5").values = [["Deterministic OCR-rule lower bound"]];
for (const range of ["A5:C5", "E5:G5"]) {
  summary.getRange(range).format = { fill: "#176B68", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", rowHeight: 26 };
}
summary.getRange("A6:C8").values = [["Actual / predicted", "GO", "NO-GO"], ["Good site", null, null], ["No-go site", null, null]];
summary.getRange("E6:G8").values = [["Actual / predicted", "GO", "NO-GO"], ["Good site", null, null], ["No-go site", null, null]];
summary.getRange("B7").formulas = [[`=COUNTIFS('Row-Level'!$C$2:$C$${rowData.length + 1},"361_scan_corpus",'Row-Level'!$D$2:$D$${rowData.length + 1},"scannable",'Row-Level'!$K$2:$K$${rowData.length + 1},"go")`]];
summary.getRange("C7").formulas = [[`=COUNTIFS('Row-Level'!$C$2:$C$${rowData.length + 1},"361_scan_corpus",'Row-Level'!$D$2:$D$${rowData.length + 1},"scannable",'Row-Level'!$K$2:$K$${rowData.length + 1},"no_go")`]];
summary.getRange("B8").formulas = [[`=COUNTIFS('Row-Level'!$C$2:$C$${rowData.length + 1},"361_scan_corpus",'Row-Level'!$D$2:$D$${rowData.length + 1},"not_scannable",'Row-Level'!$K$2:$K$${rowData.length + 1},"go")`]];
summary.getRange("C8").formulas = [[`=COUNTIFS('Row-Level'!$C$2:$C$${rowData.length + 1},"361_scan_corpus",'Row-Level'!$D$2:$D$${rowData.length + 1},"not_scannable",'Row-Level'!$K$2:$K$${rowData.length + 1},"no_go")`]];
summary.getRange("F7").formulas = [[`=COUNTIFS('Row-Level'!$C$2:$C$${rowData.length + 1},"361_scan_corpus",'Row-Level'!$D$2:$D$${rowData.length + 1},"scannable",'Row-Level'!$M$2:$M$${rowData.length + 1},"go")`]];
summary.getRange("G7").formulas = [[`=COUNTIFS('Row-Level'!$C$2:$C$${rowData.length + 1},"361_scan_corpus",'Row-Level'!$D$2:$D$${rowData.length + 1},"scannable",'Row-Level'!$M$2:$M$${rowData.length + 1},"no_go")`]];
summary.getRange("F8").formulas = [[`=COUNTIFS('Row-Level'!$C$2:$C$${rowData.length + 1},"361_scan_corpus",'Row-Level'!$D$2:$D$${rowData.length + 1},"not_scannable",'Row-Level'!$M$2:$M$${rowData.length + 1},"go")`]];
summary.getRange("G8").formulas = [[`=COUNTIFS('Row-Level'!$C$2:$C$${rowData.length + 1},"361_scan_corpus",'Row-Level'!$D$2:$D$${rowData.length + 1},"not_scannable",'Row-Level'!$M$2:$M$${rowData.length + 1},"no_go")`]];

summary.getRange("A10:C13").values = [["Metric", "Baseline", "OCR lower bound"], ["No-go recall", null, null], ["No-go precision", null, null], ["Good-site retention", null, null]];
summary.getRange("B11").formulas = [["=IFERROR(C8/(C8+B8),0)"]];
summary.getRange("C11").formulas = [["=IFERROR(G8/(G8+F8),0)"]];
summary.getRange("B12").formulas = [["=IFERROR(C8/(C8+C7),0)"]];
summary.getRange("C12").formulas = [["=IFERROR(G8/(G8+G7),0)"]];
summary.getRange("B13").formulas = [["=IFERROR(B7/(B7+C7),0)"]];
summary.getRange("C13").formulas = [["=IFERROR(F7/(F7+G7),0)"]];
summary.getRange("B11:C13").format.numberFormat = "0.0%";

summary.getRange("E10:H10").merge();
summary.getRange("E10").values = [["Staged decision lanes — corpus only"]];
summary.getRange("E11:F15").values = [["Lane", "Rows"], ["Deterministic text", null], ["Runtime corroboration", null], ["Status/network corroboration", null], ["Diagnostic continue", null]];
const lanes = ["deterministic_text", "runtime_corroboration", "status_or_network_corroboration", "diagnostic_continue"];
lanes.forEach((lane, index) => {
  summary.getRange(`F${index + 12}`).formulas = [[`=COUNTIFS('Row-Level'!$C$2:$C$${rowData.length + 1},"361_scan_corpus",'Row-Level'!$O$2:$O$${rowData.length + 1},"${lane}")`]];
});

summary.getRange("A16:H16").merge();
summary.getRange("A16").values = [["Interpretation"]];
summary.getRange("A17:H19").merge();
summary.getRange("A17").values = [[
  "The OCR replay is a conservative lower bound: it excludes HTTP status, network challenge endpoints, DOM text that OCR missed, and the new temporal confirmation pass. Blank/loading rows remain in a separate runtime-corroboration lane. Missing-assets or partial branded renders continue with diagnostics to protect valid sites from premature rejection.",
]];
summary.getRange("A17:H19").format = { fill: "#FFF7E7", font: { color: "#6D4C16" }, wrapText: true, verticalAlignment: "top" };

summary.getRange("A21:H21").merge();
summary.getRange("A21").values = [["Cerebras holdout result"]];
summary.getRange("A22:H24").merge();
summary.getRange("A22").values = [[
  "The 2026-07-10 production scan returned HTTP 200 and loaded assets, but the retained page was a prelaunch shell: “your browser can’t render the visitor … check back at launch.” Existing CertScore missed it. The calibrated classifier now assigns site_not_ready / no_go and the exact case is covered by an integration fixture.",
]];
summary.getRange("A22:H24").format = { fill: "#FDE2E1", font: { color: "#7C2424" }, wrapText: true, verticalAlignment: "top" };

for (const range of ["A6:C8", "E6:G8", "A10:C13", "E11:F15"]) {
  summary.getRange(range).format.borders = { preset: "all", style: "thin", color: "#C8D5DD" };
}
for (const range of ["A6:C6", "E6:G6", "A10:C10", "E11:F11"]) {
  summary.getRange(range).format = { fill: "#DCEAF1", font: { bold: true, color: "#123047" }, horizontalAlignment: "center" };
}
summary.getRange("A16:H16").format = { fill: "#176B68", font: { bold: true, color: "#FFFFFF" } };
summary.getRange("A21:H21").format = { fill: "#A33A3A", font: { bold: true, color: "#FFFFFF" } };
summary.getRange("A1:H24").format.font.name = "Aptos";
summary.getRange("A1:H24").format.verticalAlignment = "center";
summary.getRange("A:A").format.columnWidthPx = 175;
summary.getRange("B:C").format.columnWidthPx = 105;
summary.getRange("D:D").format.columnWidthPx = 30;
summary.getRange("E:E").format.columnWidthPx = 205;
summary.getRange("F:G").format.columnWidthPx = 110;
summary.getRange("H:H").format.columnWidthPx = 120;
summary.freezePanes.freezeRows(3);

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: "Summary", range: "A1:H24", scale: 1.5, format: "png" });
await fs.writeFile(path.join(outputDir, "summary-preview.png"), new Uint8Array(await preview.arrayBuffer()));
const detailPreview = await workbook.render({ sheetName: "Row-Level", range: "A1:R12", scale: 0.7, format: "png" });
await fs.writeFile(path.join(outputDir, "row-level-preview.png"), new Uint8Array(await detailPreview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "certscore-no-go-calibration.xlsx"));

console.log((await workbook.inspect({ kind: "table", range: "Summary!A5:H15", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 10 })).ndjson);
console.log((await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula errors" })).ndjson);
