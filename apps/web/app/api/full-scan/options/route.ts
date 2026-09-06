import { NextResponse } from "next/server";
import { readFullSiteOptions } from "../../../../server/scans/full-site-options";
export async function GET() {
  const options = await readFullSiteOptions();
  return NextResponse.json(options.allowed ? options : { allowed: false }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
