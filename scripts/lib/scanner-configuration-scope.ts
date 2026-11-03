import { createHash } from "node:crypto";

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

/** Keep existing configuration writers unreachable in the restricted mode. */
export async function configureScannerSettingsUnlessPreserved(preserve: boolean, configure: () => Promise<void>) {
  if (!preserve) await configure();
}

export type ScannerOperationalSnapshot = {
  memoryMb: number;
  timeoutSeconds: number;
  environmentSha256: string;
};

/** Private deployment readback. Snapshots/errors retain no environment values;
 * image provenance is the sole permitted environment difference. */
export function scannerOperationalSnapshot(value: unknown, input: { memoryMb: number; inventory: boolean }): ScannerOperationalSnapshot {
  const fail = () => { throw new Error("Scanner operational settings are unavailable, unhealthy or outside the existing worker bounds; refusing to normalize them."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>, variables = v.Variables;
  if (v.MemorySize !== input.memoryMb || !Number.isInteger(v.Timeout) || typeof v.Timeout !== "number" || v.Timeout < 1 || v.Timeout > 900 ||
      typeof v.RevisionId !== "string" || !v.RevisionId || v.EnvironmentError || v.State !== "Active" || v.LastUpdateStatus !== "Successful" ||
      !variables || typeof variables !== "object" || Array.isArray(variables) || Object.values(variables).some(x => typeof x !== "string")) return fail();
  const env = variables as Record<string, string>;
  if (input.inventory && (v.Timeout !== 25 || env.CERTSCORE_FULL_SITE_INVENTORY_WORKER !== "1")) return fail();
  return { memoryMb: input.memoryMb, timeoutSeconds: v.Timeout,
    environmentSha256: createHash("sha256").update(JSON.stringify(Object.entries(env)
      .filter(([key]) => key !== "SCANNER_IMAGE_DIGEST").sort(([a], [b]) => a.localeCompare(b)))).digest("hex") };
}

export function assertScannerOperationalSettingsPreserved(before: ScannerOperationalSnapshot, after: ScannerOperationalSnapshot) {
  if (before.memoryMb !== after.memoryMb || before.timeoutSeconds !== after.timeoutSeconds || before.environmentSha256 !== after.environmentSha256)
    throw new Error("Scanner operational settings changed during image promotion; refusing to overwrite or report successful preservation.");
}
