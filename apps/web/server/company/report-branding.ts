import "server-only";

import { normalizeReportHeaderTheme } from "../../lib/report-header-theme";
import { cache } from "react";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { queryOne } from "@website-signal-risk-scanner/db";
import { createSignedStorageUrl, getS3Client, getStorageBucketName } from "../storage/s3";
import { isWorkspaceLogoKey, MAX_LOGO_UPLOAD_BYTES, normalizeCompanyLogo } from "./logo-image";

// Callers supply the authenticated viewer's workspace, never a scan's owner.
export const getWorkspaceBrandingRecord = cache(async (organizationId: string) => {
  const row = await queryOne<{ name: string; logo_storage_key: string | null; report_header_theme: unknown }>(
    "select name, logo_storage_key, report_header_theme from organizations where id = $1", [organizationId], { readOnly: true },
  );
  return row ? { name: row.name, headerTheme: normalizeReportHeaderTheme(row.report_header_theme),
    key: row.logo_storage_key && isWorkspaceLogoKey(organizationId, row.logo_storage_key) ? row.logo_storage_key : null } : null;
});

export async function getWorkspaceReportBranding(organizationId: string) {
  const branding = await getWorkspaceBrandingRecord(organizationId);
  return branding ? { name: branding.name, headerTheme: branding.headerTheme, logoUrl: branding.key ? await createSignedStorageUrl(branding.key, 3600) : null } : null;
}

export async function loadWorkspaceReportLogo(organizationId: string) {
  const branding = await getWorkspaceBrandingRecord(organizationId);
  if (!branding?.key) return null;
  const result = await getS3Client().send(new GetObjectCommand({ Bucket: getStorageBucketName(), Key: branding.key }));
  if (!result.Body || (result.ContentLength ?? 0) > MAX_LOGO_UPLOAD_BYTES) return null;
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    length += chunk.length;
    if (length > MAX_LOGO_UPLOAD_BYTES) throw new Error("Workspace logo exceeds the upload limit.");
    chunks.push(Buffer.from(chunk));
  }
  // Also validate legacy uploads before passing any bytes into the PDF renderer.
  const body = await normalizeCompanyLogo(Buffer.concat(chunks), result.ContentType ?? "image/png");
  return { name: branding.name, headerTheme: branding.headerTheme, image: { body, contentType: "image/png" } };
}
