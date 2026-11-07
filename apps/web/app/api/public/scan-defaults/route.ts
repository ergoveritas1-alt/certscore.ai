import { NextRequest, NextResponse } from "next/server";
import { isRecognizedSessionCookieName } from "../../../../lib/auth/session-cookie";
import { visitorCountryScanFrom } from "../../../../lib/scans/visitor-scan-default";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const hasSessionCookie = request.cookies.getAll().some(cookie => isRecognizedSessionCookieName(cookie.name));
  const countryDefault = visitorCountryScanFrom(request.headers);
  return NextResponse.json({
    homepageLocation: countryDefault === "california" ? "US" : "EU",
    scanFrom: hasSessionCookie ? null : countryDefault,
  }, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Vary": "Cookie, CF-IPCountry, CloudFront-Viewer-Country",
    },
  });
}
