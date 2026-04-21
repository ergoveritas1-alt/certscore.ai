import { NextResponse } from "next/server";
import { getRuntimeVersionInfo } from "../../../server/runtime-version";

export const dynamic = "force-dynamic";

function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (!host) {
    return new URL(request.url).origin;
  }

  const protocol = request.headers.get("x-forwarded-proto")?.trim() || (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export function GET(request: Request) {
  const info = getRuntimeVersionInfo(process.env, { appUrl: getRequestOrigin(request) });

  return NextResponse.json(info, {
    headers: {
      "Cache-Control": "no-store",
      "X-CertScore-Git-Ref": info.gitRef ?? "unknown",
      "X-CertScore-Git-Sha": info.gitSha ?? "unknown",
      "X-CertScore-Runtime-Target": info.runtimeTarget
    }
  });
}
