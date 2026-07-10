#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { classifyScanNoGoTextForCalibration } from "../index.js";

type CsvRow = Record<string, string>;

void main();

async function main() {
  const labelsPath = getArg("--labels");
  const qualityPath = getArg("--quality");
  if (!labelsPath || !qualityPath) {
    console.error("Usage: calibrate-no-go-corpus --labels <classification.csv> --quality <quality-report.csv>");
    process.exit(1);
  }

  const [labelsText, qualityText] = await Promise.all([
    readFile(path.resolve(labelsPath), "utf8"),
    readFile(path.resolve(qualityPath), "utf8"),
  ]);
  const labels = parseCsv(labelsText);
  const qualityByScanId = new Map<string, CsvRow>(
    parseCsv(qualityText).flatMap((row) => row.scan_id ? [[row.scan_id, row] as const] : []),
  );
  const counts = { falseNegative: 0, falsePositive: 0, trueNegative: 0, truePositive: 0 };
  const hitsByClassifier: Record<string, number> = {};
  const missesByClassifier: Record<string, number> = {};
  const disagreements: Array<{
    detectedTextExcerpt: string;
    expected: "go" | "no_go";
    pageClassifier: string;
    predicted: "go" | "no_go";
    reasonCode: string | null;
    scanId: string;
  }> = [];

  for (const row of labels) {
    const scanId = row.scan_id;
    if (!scanId) continue;
    const actualNoGo = row.classification === "not_scannable";
    const replay = classifyScanNoGoTextForCalibration(qualityByScanId.get(scanId)?.detected_text ?? "");
    if (actualNoGo && replay) {
      counts.truePositive += 1;
      increment(hitsByClassifier, row.page_classifier || "unclassified");
    } else if (actualNoGo) {
      counts.falseNegative += 1;
      increment(missesByClassifier, row.page_classifier || "unclassified");
      disagreements.push(disagreement(row, scanId, "no_go", "go", null, qualityByScanId));
    } else if (replay) {
      counts.falsePositive += 1;
      disagreements.push(disagreement(row, scanId, "go", "no_go", replay.reasonCode, qualityByScanId));
    } else {
      counts.trueNegative += 1;
    }
  }

  const predictedPositive = counts.truePositive + counts.falsePositive;
  const actualPositive = counts.truePositive + counts.falseNegative;
  const actualNegative = counts.trueNegative + counts.falsePositive;
  process.stdout.write(`${JSON.stringify({
    corpusRows: labels.length,
    replayMode: "OCR text-only; HTTP, network, temporal, and screenshot-sparsity signals are not available",
    counts,
    metrics: {
      accuracy: divide(counts.truePositive + counts.trueNegative, labels.length),
      precision: divide(counts.truePositive, predictedPositive),
      recall: divide(counts.truePositive, actualPositive),
      specificity: divide(counts.trueNegative, actualNegative),
    },
    hitsByClassifier,
    missesByClassifier,
    disagreements,
  }, null, 2)}\n`);
}

function disagreement(
  row: CsvRow,
  scanId: string,
  expected: "go" | "no_go",
  predicted: "go" | "no_go",
  reasonCode: string | null,
  qualityByScanId: Map<string, CsvRow>,
) {
  return {
    detectedTextExcerpt: (qualityByScanId.get(scanId)?.detected_text ?? "").replace(/\s+/g, " ").slice(0, 240),
    expected,
    pageClassifier: row.page_classifier || "unclassified",
    predicted,
    reasonCode,
    scanId,
  };
}

function getArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function increment(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

function divide(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift() ?? [];
  return rows
    .filter((values) => values.some((value) => value.length > 0))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}
