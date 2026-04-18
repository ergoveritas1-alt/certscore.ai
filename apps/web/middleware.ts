import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const FIXED_EGRESS_ORIGIN = process.env.FIXED_EGRESS_ORIGIN?.trim() || "https://certscore.ai";

export function middleware(request: NextRequest) {
  const destination = new URL(request.nextUrl.pathname + request.nextUrl.search, FIXED_EGRESS_ORIGIN);
  return NextResponse.rewrite(destination);
}

export const config = {
  matcher: ["/((?!\\.well-known).*)"]
};
