import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath =
  "/Users/benmasek/Downloads/consent-geometry-outlier-review (1).xlsx";
const outputDir = "/Users/benmasek/WC01/outputs/consent-audit";

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 30,
  tableMaxCols: 20,
  tableMaxCellChars: 180,
});

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 4000,
});
const review = await workbook.inspect({
  kind: "table",
  range: "Review!A5:N25",
  include: "values,formulas",
  tableMaxRows: 30,
  tableMaxCols: 20,
  tableMaxCellChars: 500,
  maxChars: 50000,
});
const evidenceIndex = await workbook.inspect({
  kind: "table",
  range: "Evidence Index!A5:O25",
  include: "values,formulas",
  tableMaxRows: 30,
  tableMaxCols: 20,
  tableMaxCellChars: 500,
  maxChars: 50000,
});

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(`${outputDir}/workbook-overview.ndjson`, overview.ndjson);
await fs.writeFile(`${outputDir}/workbook-sheets.ndjson`, sheets.ndjson);
await fs.writeFile(`${outputDir}/review.ndjson`, review.ndjson);
await fs.writeFile(`${outputDir}/evidence-index.ndjson`, evidenceIndex.ndjson);

const sheetNames = [];
for (const line of sheets.ndjson.split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  const name = row.name ?? row.sheetName;
  if (typeof name === "string") sheetNames.push(name);
}

for (const sheetName of sheetNames) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  const safeName = sheetName.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
  await fs.writeFile(
    `${outputDir}/${safeName}.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}

console.log(overview.ndjson);
