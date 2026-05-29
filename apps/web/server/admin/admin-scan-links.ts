export function getAdminAuthenticatedScanHref(scanId: string | null | undefined) {
  const normalized = scanId?.trim();
  return normalized ? `/app/scans/${normalized}` : "";
}
