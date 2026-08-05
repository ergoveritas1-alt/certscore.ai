const CHUNK_LOAD_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [^\s]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i
];

export function isChunkLoadError(error: Pick<Error, "message" | "name">) {
  const description = `${error.name}: ${error.message}`;
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(description));
}

export function getChunkLoadRecoveryKey(
  error: Pick<Error, "message" | "name">,
  pathname: string
) {
  const failedAsset = error.message.match(/https?:\/\/[^\s)]+/)?.[0] ?? error.message;
  return `certscore:chunk-load-recovery:${pathname}:${failedAsset}`;
}
