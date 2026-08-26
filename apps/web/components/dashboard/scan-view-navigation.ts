const SCAN_REPORT_PATH_PATTERN = /^\/app\/scans(?:o)?\/[^/]+\/?$/;

export function isScanReportPath(pathname: string) {
  return SCAN_REPORT_PATH_PATTERN.test(pathname);
}

export function resolveScanViewHref(lastScanReportPath: string | null | undefined) {
  return lastScanReportPath && isScanReportPath(lastScanReportPath)
    ? lastScanReportPath
    : "/app/signals";
}
