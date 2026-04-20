import { NextResponse } from "next/server";
import { getRuntimeVersionInfo } from "../../../server/runtime-version";

export const dynamic = "force-dynamic";

export function GET() {
  const info = getRuntimeVersionInfo();

  return NextResponse.json(info, {
    headers: {
      "Cache-Control": "no-store",
      "X-CertScore-Git-Ref": info.gitRef ?? "unknown",
      "X-CertScore-Git-Sha": info.gitSha ?? "unknown",
      "X-CertScore-Runtime-Target": info.runtimeTarget
    }
  });
}
