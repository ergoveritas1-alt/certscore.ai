import { SCANNER_PROVENANCE_REGIONS, scannerImageDigest, type ScannerRegion } from './scanner-image-provenance';
export type ScannerArtifact = { sha: string; images: Record<string, string>; runtimeBase: 'rebuilt' | 'reused'; };
export function assertScannerArtifact(artifact: ScannerArtifact, expectedSha: string) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || artifact.sha !== expectedSha) throw new Error('Scanner artifact/SHA mismatch.');
  if (Object.keys(artifact.images).length !== SCANNER_PROVENANCE_REGIONS.length) throw new Error('Incomplete scanner regional artifact.');
  let baseline: string | undefined;
  for (const region of SCANNER_PROVENANCE_REGIONS) {
    const uri = artifact.images[region];
    if (!uri?.startsWith(`199536052647.dkr.ecr.${region}.amazonaws.com/`)) throw new Error('Scanner artifact regional binding mismatch.');
    const digest = scannerImageDigest(uri);
    if (baseline && digest !== baseline) throw new Error('Scanner artifact digest parity mismatch.');
    baseline = digest;
  }
}

export function assertScannerArtifactMetadata(environment: unknown, expectedSha: string) {
  if (!Array.isArray(environment) || !environment.includes(`BUILD_GIT_SHA=${expectedSha}`) ||
      !environment.includes(`BUILD_IMAGE_TAG=${expectedSha}`)) throw new Error('Prepared scanner image metadata/SHA mismatch.');
}

export async function settleScannerOperations<T>(operations: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(operations);
  const failures = results.filter((value): value is PromiseRejectedResult => value.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map(value => value.reason), "Scanner operation failed; concurrent scanner work was drained before cleanup.");
  return results.map(value => (value as PromiseFulfilledResult<T>).value);
}

export async function runScannerPromotions(promote: (region: ScannerRegion, inventory: boolean) => Promise<void>, parallel: boolean) {
  if (parallel) {
    await settleScannerOperations(SCANNER_PROVENANCE_REGIONS.flatMap(region => [promote(region, false), promote(region, true)]));
  } else {
    await settleScannerOperations(SCANNER_PROVENANCE_REGIONS.map(async region => {
      await promote(region, false);
      await promote(region, true);
    }));
  }
}
