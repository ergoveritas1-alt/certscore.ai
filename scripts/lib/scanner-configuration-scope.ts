/** Image promotion maintains SCANNER_IMAGE_DIGEST through guarded environment
 * writes. Never promise an image-only release under a no-configuration grant. */
export function assertScannerConfigurationScope(input: {
  mode: "all" | "db" | "scanners" | "validation" | "web";
  preserveScannerConfiguration: boolean;
  plan: boolean;
  dryRun: boolean;
}) {
  if (input.preserveScannerConfiguration && !input.plan && !input.dryRun &&
      (input.mode === "all" || input.mode === "scanners")) {
    throw new Error("Scanner promotion requires configuration writes for SCANNER_IMAGE_DIGEST provenance; the current deploy flow also applies identity and coverage settings. Refusing before remote work under --preserve-scanner-configuration. Use a consumer-only plan until the exact required writes are separately authorized.");
  }
}
