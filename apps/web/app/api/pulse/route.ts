import { NextResponse } from "next/server";

export function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/v1/pulse";
  return NextResponse.redirect(url, 308);
}
