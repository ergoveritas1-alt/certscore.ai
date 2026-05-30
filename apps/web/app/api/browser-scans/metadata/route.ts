import { NextResponse } from "next/server";
import {
  BROWSER_SCAN_CAPTURE_MODE,
  BROWSER_SCAN_MODE,
  BROWSER_SCAN_SOURCE_ID,
  BROWSER_SCAN_SOURCE_TYPE
} from "../../../../server/browser-scans/schema";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      captureMode: BROWSER_SCAN_CAPTURE_MODE,
      defaultScanWindowMs: 15000,
      maxEventsPerUpload: 1000,
      minScanWindowMs: 3000,
      scanMode: BROWSER_SCAN_MODE,
      service: "certscore-browser-scans",
      sourceId: BROWSER_SCAN_SOURCE_ID,
      sourceType: BROWSER_SCAN_SOURCE_TYPE,
      status: "ok"
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
