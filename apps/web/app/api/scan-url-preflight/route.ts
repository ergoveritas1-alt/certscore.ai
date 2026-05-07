import { NextResponse } from "next/server";
import { validateScanUrl } from "../../../server/scan-intake/url-preflight";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const domain = typeof payload?.domain === "string" ? payload.domain : "";
    const result = await validateScanUrl(domain);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      },
      status: 200
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "URL validation could not be completed."
      },
      { status: 500 }
    );
  }
}
