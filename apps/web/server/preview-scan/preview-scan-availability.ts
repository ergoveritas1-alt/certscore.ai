export function getPreviewScanAvailability(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: true,
    reason: null
  } as const;
}
