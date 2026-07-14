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
  const safeInfo = {
    appUrl: info.appUrl,
    gitRef: info.gitRef,
    gitSha: info.gitSha,
    imageTag: info.imageTag,
    runtimeTarget: info.runtimeTarget,
    service: info.service,
    timestamp: info.timestamp
  };

  return NextResponse.json(safeInfo, {
    headers: {
      "Cache-Control": "no-store",
      "X-CertScore.ai-Build-Sha": info.gitSha ?? "unknown",
      "X-CertScore.ai-Git-Ref": info.gitRef ?? "unknown",
      "X-CertScore.ai-Git-Sha": info.gitSha ?? "unknown",
      "X-CertScore.ai-Runtime-Target": info.runtimeTarget
    }
  });
}
