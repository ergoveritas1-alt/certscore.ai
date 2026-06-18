import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getVisualEvidenceArtifacts } from "../../../../../../lib/scans/visual-evidence";
import { isPlatformAdminEmail } from "../../../../../../server/admin/platform-admin";
import { getCurrentUser } from "../../../../../../server/auth";
import { bootstrapAppUserSession } from "../../../../../../server/bootstrap-user";
import { getAnonymousScanById, getScanById } from "../../../../../../server/scans/get-scan-by-id";
import {
  getLocalV2DagReportInput,
  materializeLocalV2DagScanDetail
} from "../../../../../../server/scans/local-v2-dag-report";
import { createSignedStorageUrl, getStorageBucketName } from "../../../../../../server/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    artifactId: string;
    scanId: string;
  }>;
};

function canViewVisualEvidence(input: { isPlatformAdmin: boolean; role: string | null | undefined }) {
  return input.isPlatformAdmin || input.role === "admin" || input.role === "advanced";
}

function isLocalStorageEndpoint(value: string | undefined) {
  return Boolean(value && /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i.test(value));
}

function isSafeStorageKey(value: string) {
  return !path.isAbsolute(value) && !value.split("/").some((part) => part === "..");
}

async function getLocalDevVisualEvidenceResponse(input: { contentType: string | null; key: string }) {
  if (!isLocalStorageEndpoint(process.env.S3_ENDPOINT) || !isSafeStorageKey(input.key)) {
    return null;
  }

  const bucket = getStorageBucketName();
  const candidateRoots = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../..")
  ];

  for (const root of candidateRoots) {
    try {
      const objectPath = path.join(root, "tmp", "minio-data", bucket, input.key);
      const body = await readFile(objectPath);
      return new NextResponse(body, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": input.contentType ?? "application/octet-stream"
        }
      });
    } catch {
      // Try the next plausible local dev root before falling back to signed storage.
    }
  }

  return null;
}

async function getLocalV2DagVisualEvidenceResponse(input: { contentType: string | null; key: string }) {
  if (!input.key.startsWith("local-v2-dag-scans/") || !isSafeStorageKey(input.key)) {
    return null;
  }

  const candidateRoots = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../..")
  ];

  for (const root of candidateRoots) {
    try {
      const objectPath = path.join(root, "artifacts", input.key);
      const body = await readFile(objectPath);
      return new NextResponse(body, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": input.contentType ?? "image/png"
        }
      });
    } catch {
      // Try the next plausible workspace root before falling back.
    }
  }

  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  const [{ artifactId, scanId }, user] = await Promise.all([context.params, getCurrentUser()]);
  let scanRecord = await getAnonymousScanById(scanId);
  if (!scanRecord && user) {
    const { membership, organization } = await bootstrapAppUserSession(user);
    if (!canViewVisualEvidence({ isPlatformAdmin: isPlatformAdminEmail(user.email), role: membership.role })) {
      return NextResponse.json({ error: "Admin or advanced access required." }, { status: 403 });
    }
    scanRecord = await getScanById({
      organizationId: organization.id,
      scanId,
      viewerEmail: user.email
    });
  }

  if (!scanRecord) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  const displayScanRecord =
    getLocalV2DagReportInput(scanRecord) && scanRecord.scan.status === "completed"
      ? await materializeLocalV2DagScanDetail(scanRecord)
      : scanRecord;

  const artifact = getVisualEvidenceArtifacts(displayScanRecord.runtimeArtifacts).find((candidate) => candidate.id === decodeURIComponent(artifactId));
  if (!artifact || artifact.status !== "available" || !artifact.key) {
    return NextResponse.json({ error: "Visual evidence is unavailable." }, { status: 404 });
  }

  const localV2Response = await getLocalV2DagVisualEvidenceResponse({
    contentType: artifact.mimeType,
    key: artifact.key
  });
  if (localV2Response) {
    return localV2Response;
  }

  const localDevResponse = await getLocalDevVisualEvidenceResponse({
    contentType: artifact.mimeType,
    key: artifact.key
  });
  if (localDevResponse) {
    return localDevResponse;
  }

  const signedUrl = await createSignedStorageUrl(artifact.key, 300);
  return NextResponse.redirect(signedUrl, {
    headers: {
      "Cache-Control": "private, no-store"
    }
  });
}
