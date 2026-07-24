import { NextResponse } from "next/server";
import {
  getAdminScanLiveStatus,
  type AdminScanLiveTarget
} from "../../../../../server/admin/admin-scan-live-status";
import { getPlatformAdminFlag } from "../../../../../server/admin/platform-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!await getPlatformAdminFlag()) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { targets?: unknown } | null;
  if (!body || !Array.isArray(body.targets)) {
    return NextResponse.json({ error: "A targets array is required." }, { status: 400 });
  }

  const targets = body.targets.flatMap((value): AdminScanLiveTarget[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const candidate = value as Record<string, unknown>;
    if (
      (candidate.kind !== "scan" && candidate.kind !== "request") ||
      typeof candidate.id !== "string" ||
      typeof candidate.status !== "string"
    ) {
      return [];
    }
    return [{
      id: candidate.id,
      kind: candidate.kind,
      status: candidate.status
    }];
  }).slice(0, 100);
  const status = await getAdminScanLiveStatus(targets);

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
