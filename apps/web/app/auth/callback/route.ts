import { NextResponse } from "next/server";
import { getRequestOrigin } from "../../../server/http/request-origin";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const callbackUrl = new URL("/api/auth/callback/google", getRequestOrigin(request));

  requestUrl.searchParams.forEach((value, key) => {
    callbackUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(callbackUrl);
}
