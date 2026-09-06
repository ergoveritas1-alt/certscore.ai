import { NextResponse } from "next/server";
import { readFullSiteOptions } from "../../../../server/scans/full-site-options";
export async function GET() {
  return NextResponse.json(await readFullSiteOptions(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
