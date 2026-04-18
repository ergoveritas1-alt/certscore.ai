"use server";

import { persistScanReportFindingCount } from "./repository";

export async function persistReportFindingCount(input: {
  count: number;
  scanId: string;
}) {
  try {
    await persistScanReportFindingCount(input);
  } catch (error) {
    console.error("Failed to persist report finding count", {
      error: error instanceof Error ? error.message : String(error),
      scanId: input.scanId
    });
  }
}
