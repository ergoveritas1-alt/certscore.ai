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
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer"
    },
    status
  });
}

function normalizeScanIds(scanIds: unknown) {
  if (!Array.isArray(scanIds) || scanIds.length === 0 || scanIds.length > MAX_SCANS_PER_REQUEST) return null;
  const normalized = [...new Set(scanIds.map((scanId) => typeof scanId === "string" ? scanId.trim() : ""))];
  return normalized.length === scanIds.length && normalized.every((scanId) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scanId)
  )
    ? normalized
    : null;
}

function parsePostScanIds(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return normalizeScanIds((value as Record<string, unknown>).scanIds);
}

function parseGetScanIds(request: Request) {
  return normalizeScanIds(new URL(request.url).searchParams.getAll("scanId"));
}

async function requirePlatformAdmin() {
  const user = await getBetterAuthSessionUser();
  if (!user) return response({ error: "Authentication required." }, 401);
  if (!isPlatformAdminEmail(user.email)) return response({ error: "Platform admin access required." }, 403);
  return null;
}

async function runCohort(scanIds: string[]) {
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

export async function GET(request: Request) {
  const authError = await requirePlatformAdmin();
  if (authError) return authError;
  const scanIds = parseGetScanIds(request);
  if (!scanIds) {
    return response({ error: `Provide between 1 and ${MAX_SCANS_PER_REQUEST} unique scanId query parameters.` }, 400);
  }
  return runCohort(scanIds);
}

export async function POST(request: Request) {
  const authError = await requirePlatformAdmin();
  if (authError) return authError;
  const scanIds = parsePostScanIds(await request.json().catch(() => null));
  if (!scanIds) {
    return response({ error: `Provide between 1 and ${MAX_SCANS_PER_REQUEST} unique scan IDs.` }, 400);
  }
  return runCohort(scanIds);
}
