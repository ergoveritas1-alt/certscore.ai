import { NextRequest, NextResponse } from "next/server";
import { isRecognizedSessionCookieName } from "../../../../lib/auth/session-cookie";
import { anonymousVisitorScanFrom } from "../../../../lib/scans/visitor-scan-default";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const hasSessionCookie = request.cookies.getAll().some(cookie => isRecognizedSessionCookieName(cookie.name));
  return NextResponse.json({ scanFrom: anonymousVisitorScanFrom(request.headers, hasSessionCookie) }, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Vary": "Cookie, CF-IPCountry, CloudFront-Viewer-Country",
    },
  });
}
