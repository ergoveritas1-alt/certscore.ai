import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const repoRoot = "/Users/benmasek/WC01";
const scanRoot = path.join(repoRoot, "artifacts/local-v2-dag-scans");
const outputDir = path.join(repoRoot, "outputs/019fa3eb-b2ce-76e1-af65-941f372f80b1");
const outputPath = path.join(outputDir, "consent-geometry-outlier-review.xlsx");

const selectedScanIds = [
  "2ed8bf34-77df-4e23-801c-3546616a6cd1", // booking.com: iframe + heavy clipping
  "ec66c56f-9ebe-46cc-9dc8-c5fc6f31f426", // sits.com: disabled + clipping
  "891cd2c1-7ac6-4388-90be-bdb07bae9322", // forbes.com: occlusion + disabled
  "b15de5f0-662f-4eb1-9d14-3255b82e4125", // bild.de: iframe + clipping
  "95f61c7f-8c69-4581-a57d-f5940ebd17cb", // bbc.com: iframe + occlusion
  "6bf36fa9-87bf-48af-a8fe-2f7d69fec4d2", // abc.com: iframe + all unconfirmed
  "b669f5b0-6a88-46a2-bb93-5b7de1a8b9c7", // carrefour.fr: clipping + composite
  "5853a507-77fb-4d45-875f-a249d20f379a", // airfrance.fr: splash + clipped
  "5eff6f20-1579-4e2d-848f-14beeedd7fd0", // dailymotion.com: iframe + no containers
  "235a8bc8-494f-4119-8add-972cf5f45800", // wyborcza.pl: all unconfirmed
  "a44e7619-7e44-4c6c-a641-d36b254060a1", // oxfam.org: known regression boundary
  "321d7e2f-c90d-4c8a-8489-248076c586ec", // audi.com: disabled + clipped
  "8f72fc01-cb8e-4b78-a650-4181daf62ef9", // lefigaro.fr: iframe
  "413bf2eb-f21b-45e1-badc-471a3eb2435c", // corriere.it: disabled
  "e0e96d42-d305-4001-9467-cb0e738532f6", // amazon.de: occlusion/collapsed state
  "9c932dae-9e29-44fe-9a85-a713a151218b", // wired.com: sourcepoint + all unconfirmed
  "bf35cb8a-6230-4432-a6f4-d43ec1948681", // ap.org: OneTrust + all unconfirmed
  "c47e5614-6394-4d55-8621-05489c29341d", // cnn.com: one visible, many occluded
  "547127a8-eff2-468b-8d37-81e1576aa8dc", // latimes.com: composite + clipping
  "0699fe88-a5ab-4dee-816f-d2b05d195efa", // dynamic.faz.net: multiple child frames
];

function answer(value) {
  return value === true ? "Observed" : value === false ? "Not observed" : "Unknown";
}

function hostname(pageUrl) {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return pageUrl;
  }
}

function reviewUrl(pageUrl) {
  try {
    const parsed = new URL(pageUrl);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return pageUrl;
  }
}

function issueSummary(metrics) {
  const issues = [];
  if (metrics.childFrames >= 2) issues.push("Multiple child frames");
  else if (metrics.childFrames === 1) issues.push("Child-frame placement");
  if (metrics.clipped >= 10) issues.push("Heavy clipping/internal scroll");
  else if (metrics.clipped > 0) issues.push("Clipping boundary");
  if (metrics.occluded >= 10) issues.push("Heavy occlusion");
  else if (metrics.occluded > 0) issues.push("Partial occlusion");
  if (metrics.disabled > 0) issues.push("Disabled/enabled state");
  if (metrics.composite >= 10) issues.push("Composite-container inflation");
  if (metrics.candidates >= 48) issues.push("Candidate limit");
  if (metrics.containers >= 12) issues.push("Container limit");
  if (metrics.hidden === metrics.candidates && metrics.candidates > 0) issues.push("All candidates unconfirmed");
  return issues.slice(0, 3).join("; ");
}

async function preferredScreenshot(scanDir) {
  const names = [
    "screenshot-pre-consent-geometry-proof.png",
    "screenshot-pre-consent-cmp-controls.png",
    "screenshot-pre-consent.png",
  ];
  for (const name of names) {
    const candidate = path.join(scanDir, name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next retained screenshot.
    }
  }
  return "";
}

const rows = [];
for (const scanId of selectedScanIds) {
  const scanDir = path.join(scanRoot, scanId);
  const geometryPath = path.join(scanDir, "ConsentControlGeometryEvidence.json");
  const geometry = JSON.parse(await fs.readFile(geometryPath, "utf8"));
  const candidates = geometry.candidates ?? [];
  const childFrameUrls = [...new Set(
    candidates
      .filter((candidate) => candidate.frameContext?.frameKind === "child_frame")
      .map((candidate) => candidate.frameContext?.frameUrl)
      .filter(Boolean),
  )];
  const metrics = {
    candidates: candidates.length,
    containers: (geometry.containers ?? []).length,
    childFrames: childFrameUrls.length,
    occluded: candidates.filter((candidate) => {
      const check = candidate.occlusion;
      if (!check || check.checkedPoints <= 0) return false;
      return ![
        check.center,
        check.topLeft,
        check.topRight,
        check.bottomLeft,
        check.bottomRight,
      ].every(Boolean);
    }).length,
    clipped: candidates.filter((candidate) => candidate.clippedByScrollableAncestor).length,
    disabled: candidates.filter((candidate) => !candidate.enabled).length,
    hidden: candidates.filter((candidate) => candidate.decisionStatus !== "confirmed_visible").length,
    composite: candidates.filter((candidate) => (candidate.label ?? "").length > 40).length,
  };
  rows.push({
    scanId,
    website: reviewUrl(geometry.pageUrl),
    retainedPageUrl: geometry.pageUrl,
    domain: hostname(geometry.pageUrl),
    capturedAt: new Date(geometry.capturedAt),
    cmp: geometry.cmp?.name ?? "—",
    scannerAccept: answer(geometry.summary?.firstLayerAccept),
    scannerReject: answer(geometry.summary?.firstLayerReject),
    scannerOptions: answer(geometry.summary?.firstLayerOptions),
    why: issueSummary(metrics),
    screenshotPath: await preferredScreenshot(scanDir),
    geometryPath,
    childFrameUrls: childFrameUrls.join("\n"),
    ...metrics,
  });
}

const workbook = Workbook.create();
const start = workbook.worksheets.add("Start Here");
const review = workbook.worksheets.add("Review");
const evidence = workbook.worksheets.add("Evidence Index");

const navy = "#153B55";
const blue = "#1F75A8";
const paleBlue = "#EAF4FA";
const paleYellow = "#FFF2CC";
const paleGreen = "#E2F0D9";
const paleGray = "#F3F6F8";
const border = "#CBD7DF";
const body = "#263746";

for (const sheet of [start, review, evidence]) {
  sheet.showGridLines = false;
}

// Start Here
start.getRange("A1:H2").merge();
start.getRange("A1").values = [["EU-IR Consent Geometry Outlier Review"]];
start.getRange("A1:H2").format = {
  fill: navy,
  font: { color: "#FFFFFF", bold: true, size: 20 },
  verticalAlignment: "center",
  horizontalAlignment: "left",
};
start.getRange("A4:H4").merge();
start.getRange("A4").values = [["20 unique retained EU-IR cases selected from real scans. Only the four yellow fields are required."]];
start.getRange("A4:H4").format = {
  fill: paleBlue,
  font: { color: navy, bold: true, size: 12 },
  verticalAlignment: "center",
  wrapText: true,
};
start.getRange("A6:B13").values = [
  ["Step", "What to do"],
  ["1", "Set Chrome Incognito and VPN to EU-IR."],
  ["2", "Open the Website URL from the Review sheet."],
  ["3", "Judge only what is visible on the initial consent surface. Do not click controls."],
  ["4", "Complete Your Surface plus Your Accept / Reject / Options using the dropdowns."],
  ["5", "Use optional geometry fields only when something unusual is obvious."],
  ["Document Match", "Optional. Leave blank unless the loaded site/document is clearly different from the retained scan target."],
  ["Return", "Send back this completed workbook. No other columns need editing."],
];
start.getRange("A6:B6").format = {
  fill: navy,
  font: { color: "#FFFFFF", bold: true },
};
start.getRange("A7:A13").format = {
  fill: paleGray,
  font: { bold: true, color: navy },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
start.getRange("B7:B13").format = {
  font: { color: body },
  wrapText: true,
  verticalAlignment: "center",
};
start.getRange("A6:B13").format.borders = {
  insideHorizontal: { style: "thin", color: border },
  outside: { style: "thin", color: border },
};
start.getRange("A14:H14").merge();
start.getRange("A14").values = [["Meaning of the A/R/O choices"]];
start.getRange("A14:H14").format = { fill: navy, font: { color: "#FFFFFF", bold: true } };
start.getRange("A15:B18").values = [
  ["Observed", "A visible first-layer control clearly provides that action."],
  ["Not observed", "A consent surface is visible, but that action is not visibly offered on the first layer."],
  ["Unknown", "The site did not load reliably, the surface was unclear, or you cannot determine the action."],
  ["Reject", "Includes clear necessary-only / essential-only refusal of optional cookies. Do not count a general privacy opt-out as cookie-banner Reject."],
];
start.getRange("A15:A18").format = { fill: paleGray, font: { bold: true, color: navy } };
start.getRange("A15:B18").format.wrapText = true;
start.getRange("A15:B18").format.borders = {
  insideHorizontal: { style: "thin", color: border },
  outside: { style: "thin", color: border },
};
start.getRange("A:A").format.columnWidth = 20;
start.getRange("B:B").format.columnWidth = 92;
start.getRange("A4:H4").format.rowHeight = 34;
start.getRange("A7:B13").format.rowHeight = 38;
start.getRange("A15:B18").format.rowHeight = 38;
start.freezePanes.freezeRows(2);

// Review
review.getRange("A1:N2").merge();
review.getRange("A1").values = [["Consent Geometry Review — 20 Priority Cases"]];
review.getRange("A1:N2").format = {
  fill: navy,
  font: { color: "#FFFFFF", bold: true, size: 18 },
  verticalAlignment: "center",
};
review.getRange("A3:N3").merge();
review.getRange("A3").values = [[
  "Required: Your Surface, Your Accept, Your Reject, Your Options. Optional: geometry issue, first-layer judgment, document match, and notes.",
]];
review.getRange("A3:N3").format = {
  fill: paleBlue,
  font: { color: navy, bold: true },
  wrapText: true,
  verticalAlignment: "center",
};

const headers = [
  "Review Status",
  "Website URL",
  "Scanner Accept",
  "Scanner Reject",
  "Scanner Options",
  "Why selected",
  "Your Surface",
  "Your Accept",
  "Your Reject",
  "Your Options",
  "Geometry Issue (optional)",
  "First Layer? (optional)",
  "Document Match? (optional)",
  "Notes (optional)",
];
review.getRange("A5:N5").values = [headers];
review.getRange("A5:N5").format = {
  fill: navy,
  font: { color: "#FFFFFF", bold: true, size: 10 },
  wrapText: true,
  horizontalAlignment: "center",
  verticalAlignment: "center",
};

const reviewValues = rows.map((row) => [
  null,
  row.website,
  row.scannerAccept,
  row.scannerReject,
  row.scannerOptions,
  row.why,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
]);
review.getRange(`A6:N${5 + rows.length}`).values = reviewValues;
review.getRange("A6").formulas = [["=IF(COUNTA(G6:J6)=4,\"Complete\",\"Pending\")"]];
review.getRange(`A6:A${5 + rows.length}`).fillDown();
review.getRange(`G6:J${5 + rows.length}`).format.fill = paleYellow;
review.getRange(`K6:N${5 + rows.length}`).format.fill = paleBlue;
review.getRange(`A6:A${5 + rows.length}`).format = {
  fill: paleGray,
  font: { bold: true, color: navy },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
review.getRange(`C6:E${5 + rows.length}`).format.horizontalAlignment = "center";
review.getRange(`A6:N${5 + rows.length}`).format = {
  ...review.getRange(`A6:N${5 + rows.length}`).format,
  font: { color: body, size: 10 },
  verticalAlignment: "center",
  wrapText: true,
};
review.getRange(`A6:N${5 + rows.length}`).format.borders = {
  insideHorizontal: { style: "thin", color: border },
};

review.getRange(`G6:G${5 + rows.length}`).dataValidation = {
  rule: { type: "list", values: ["Visible", "Not visible", "Unclear", "Site unavailable"] },
};
for (const column of ["H", "I", "J"]) {
  review.getRange(`${column}6:${column}${5 + rows.length}`).dataValidation = {
    rule: { type: "list", values: ["Observed", "Not observed", "Unknown"] },
  };
}
review.getRange(`K6:K${5 + rows.length}`).dataValidation = {
  rule: {
    type: "list",
    values: [
      "None",
      "Partial clipping",
      "Full occlusion",
      "Hidden/offscreen parent frame",
      "Multiple surfaces",
      "Delayed/animated",
      "Internal scroll",
      "Overlay/click shield",
      "Responsive difference",
      "Other",
      "Unclear",
    ],
  },
};
review.getRange(`L6:L${5 + rows.length}`).dataValidation = {
  rule: { type: "list", values: ["Yes", "No", "Ambiguous"] },
};
review.getRange(`M6:M${5 + rows.length}`).dataValidation = {
  rule: { type: "list", values: ["Yes", "No", "Unclear"] },
};
review.getRange(`A6:A${5 + rows.length}`).conditionalFormats.add("containsText", {
  text: "Complete",
  format: { fill: paleGreen, font: { color: "#2F641C", bold: true } },
});
review.getRange(`A6:A${5 + rows.length}`).conditionalFormats.add("containsText", {
  text: "Pending",
  format: { fill: paleYellow, font: { color: "#8A5A00", bold: true } },
});

review.getRange("A:A").format.columnWidth = 15;
review.getRange("B:B").format.columnWidth = 36;
review.getRange("C:E").format.columnWidth = 13;
review.getRange("F:F").format.columnWidth = 32;
review.getRange("G:J").format.columnWidth = 15;
review.getRange("K:K").format.columnWidth = 25;
review.getRange("L:M").format.columnWidth = 19;
review.getRange("N:N").format.columnWidth = 30;
review.getRange("A5:N5").format.rowHeight = 42;
review.getRange(`A6:N${5 + rows.length}`).format.rowHeight = 46;
review.freezePanes.freezeRows(5);
review.freezePanes.freezeColumns(2);
const reviewTable = review.tables.add(`A5:N${5 + rows.length}`, true, "GeometryReviewTable");
reviewTable.style = "TableStyleMedium2";
reviewTable.showFilterButton = true;

// Evidence Index
const evidenceHeaders = [
  "Website",
  "Captured UTC",
  "CMP",
  "Scan ID",
  "Retained screenshot",
  "Geometry JSON",
  "Candidates",
  "Containers",
  "Child frames",
  "Occluded",
  "Clipped",
  "Disabled",
  "Unconfirmed",
  "Composite labels",
  "Child frame URLs",
];
evidence.getRange("A1:O2").merge();
evidence.getRange("A1").values = [["Retained Evidence Index — Reference Only"]];
evidence.getRange("A1:O2").format = {
  fill: navy,
  font: { color: "#FFFFFF", bold: true, size: 18 },
  verticalAlignment: "center",
};
evidence.getRange("A3:O3").merge();
evidence.getRange("A3").values = [[
  "All rows were captured from the EU-IR scan lane. These technical fields are included for auditability; you do not need to edit this sheet.",
]];
evidence.getRange("A3:O3").format = {
  fill: paleBlue,
  font: { color: navy, bold: true },
  wrapText: true,
};
evidence.getRange("A5:O5").values = [evidenceHeaders];
evidence.getRange("A5:O5").format = {
  fill: navy,
  font: { color: "#FFFFFF", bold: true, size: 10 },
  wrapText: true,
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
evidence.getRange(`A6:O${5 + rows.length}`).values = rows.map((row) => [
  row.retainedPageUrl,
  row.capturedAt,
  row.cmp,
  row.scanId,
  row.screenshotPath,
  row.geometryPath,
  row.candidates,
  row.containers,
  row.childFrames,
  row.occluded,
  row.clipped,
  row.disabled,
  row.hidden,
  row.composite,
  row.childFrameUrls,
]);
evidence.getRange(`B6:B${5 + rows.length}`).setNumberFormat("yyyy-mm-dd hh:mm:ss");
evidence.getRange(`G6:N${5 + rows.length}`).setNumberFormat("#,##0");
evidence.getRange(`A6:O${5 + rows.length}`).format = {
  font: { color: body, size: 9 },
  verticalAlignment: "center",
  wrapText: true,
};
evidence.getRange(`A6:O${5 + rows.length}`).format.borders = {
  insideHorizontal: { style: "thin", color: border },
};
evidence.getRange("A:A").format.columnWidth = 38;
evidence.getRange("B:B").format.columnWidth = 20;
evidence.getRange("C:C").format.columnWidth = 28;
evidence.getRange("D:D").format.columnWidth = 37;
evidence.getRange("E:F").format.columnWidth = 55;
evidence.getRange("G:N").format.columnWidth = 12;
evidence.getRange("O:O").format.columnWidth = 40;
evidence.getRange("A5:O5").format.rowHeight = 38;
evidence.getRange(`A6:O${5 + rows.length}`).format.rowHeight = 42;
evidence.freezePanes.freezeRows(5);
evidence.freezePanes.freezeColumns(1);
const evidenceTable = evidence.tables.add(`A5:O${5 + rows.length}`, true, "EvidenceIndexTable");
evidenceTable.style = "TableStyleMedium2";
evidenceTable.showFilterButton = true;

await fs.mkdir(outputDir, { recursive: true });
const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(outputPath);

const reviewInspect = await workbook.inspect({
  kind: "table",
  range: `Review!A1:N${5 + rows.length}`,
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 14,
  maxChars: 8000,
});
console.log(reviewInspect.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

for (const [sheetName, range] of [
  ["Start Here", "A1:H18"],
  ["Review", "A1:N12"],
  ["Evidence Index", "A1:O10"],
]) {
  const rendered = await workbook.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(
    path.join(outputDir, `${sheetName.toLowerCase().replace(/\s+/g, "-")}-preview.png`),
    new Uint8Array(await rendered.arrayBuffer()),
  );
}

console.log(JSON.stringify({ outputPath, rowCount: rows.length }));
