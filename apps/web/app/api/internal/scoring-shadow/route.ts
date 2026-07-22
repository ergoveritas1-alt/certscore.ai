import { NextResponse } from "next/server";
import { summarizeCanonicalShadowScoreCohort } from "../../../../lib/scans/canonical-shadow-score-cohort";
import { isPlatformAdminEmail } from "../../../../server/admin/platform-admin";
import { getBetterAuthSessionUser } from "../../../../server/better-auth/session";
import { buildStoredScanCanonicalShadowScore } from "../../../../server/scans/canonical-shadow-score-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SCANS_PER_REQUEST = 5;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store" },
    status
  });
}

function parseScanIds(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const scanIds = (value as Record<string, unknown>).scanIds;
  if (!Array.isArray(scanIds) || scanIds.length === 0 || scanIds.length > MAX_SCANS_PER_REQUEST) return null;
  const normalized = [...new Set(scanIds.map((scanId) => typeof scanId === "string" ? scanId.trim() : ""))];
  return normalized.length === scanIds.length && normalized.every((scanId) => /^[0-9a-f-]{36}$/i.test(scanId))
    ? normalized
    : null;
}

export async function POST(request: Request) {
  const user = await getBetterAuthSessionUser();
  if (!user) return response({ error: "Authentication required." }, 401);
  if (!isPlatformAdminEmail(user.email)) return response({ error: "Platform admin access required." }, 403);

  const scanIds = parseScanIds(await request.json().catch(() => null));
  if (!scanIds) {
    return response({ error: `Provide between 1 and ${MAX_SCANS_PER_REQUEST} unique scan IDs.` }, 400);
  }

  const generatedAt = new Date().toISOString();
  const artifacts = [];
  const failures: Array<{ reason: string; scanId: string }> = [];
  for (const scanId of scanIds) {
    try {
      const artifact = await buildStoredScanCanonicalShadowScore(scanId, generatedAt);
      if (artifact) artifacts.push(artifact);
      else failures.push({ reason: "scan_not_found", scanId });
    } catch {
      failures.push({ reason: "projection_or_scoring_failed", scanId });
    }
  }

  return response({
    artifacts,
    failures,
    generatedAt,
    inputScanCount: scanIds.length,
    schemaVersion: "canonical-shadow-score-admin-cohort.v1",
    summary: summarizeCanonicalShadowScoreCohort(artifacts)
  });
}
