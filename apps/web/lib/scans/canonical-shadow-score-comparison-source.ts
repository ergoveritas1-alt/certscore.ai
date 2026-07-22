const LAMBDA_SCAN_SOURCES = new Set([
  "california",
  "default",
  "eu_de",
  "eu_ie",
  "lambda"
]);

const BROWSER_EXTENSION_SCAN_SOURCES = new Set([
  "browser_extension",
  "local_extension"
]);

export function canonicalShadowScoreSourceFamily(scanSource: string) {
  const normalized = scanSource.trim().toLowerCase();
  if (LAMBDA_SCAN_SOURCES.has(normalized)) return "lambda";
  if (BROWSER_EXTENSION_SCAN_SOURCES.has(normalized)) return "browser_extension";
  return normalized;
}
