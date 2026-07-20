import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Selection = { scanId: string; completedAt: string; url: string; region: string; scanArtifactUri: string };

async function main() {
  const source = JSON.parse(await readFile("artifacts/gdpr-transparency-prod-region-provenance.json", "utf8")) as { result: string };
  const selections = source.result.split(/\r?\n/).filter((line) => line && line !== "BEGIN" && line !== "COMMIT").map((line) => {
    const [scanId, completedAt, url, region, scanArtifactUri] = line.split("|");
    if (!scanId || !completedAt || !url || !region || !scanArtifactUri) throw new Error(`Malformed provenance row: ${line}`);
    return { scanId, completedAt, url, region, scanArtifactUri } satisfies Selection;
  });
  const inputRoot = path.resolve("artifacts/gdpr-transparency-regional-passive-input");
  await mkdir(inputRoot, { recursive: true });
  const regionMap: Record<string, string> = {};
  for (const selection of selections) {
    const destination = path.join(inputRoot, selection.region, selection.scanId);
    await mkdir(destination, { recursive: true });
    await execFileAsync("aws", ["s3", "cp", selection.scanArtifactUri, path.join(destination, "CanonicalEvidenceBundle.json"), "--only-show-errors"], { maxBuffer: 4 * 1024 * 1024 });
    const prefix = selection.scanArtifactUri.slice(0, selection.scanArtifactUri.lastIndexOf("/"));
    try {
      await execFileAsync("aws", ["s3", "cp", `${prefix}/auxiliary/screenshot-pre-consent.png`, path.join(destination, "auxiliary", "screenshot-pre-consent.png"), "--only-show-errors"], { maxBuffer: 4 * 1024 * 1024 });
    } catch {
      // Screenshot retention is optional; the JSON artifact remains eligible for passive analysis.
    }
    regionMap[selection.scanId] = selection.region;
    regionMap[selection.url] = selection.region;
  }
  await writeFile(path.join(inputRoot, "region-map.json"), `${JSON.stringify(regionMap, null, 2)}\n`);
  await writeFile(path.join(inputRoot, "selection.json"), `${JSON.stringify({ liveTraffic: false, selections }, null, 2)}\n`);
  console.log(JSON.stringify({ inputRoot, selectionCount: selections.length, byRegion: selections.reduce<Record<string, number>>((counts, row) => { counts[row.region] = (counts[row.region] ?? 0) + 1; return counts; }, {}) }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
