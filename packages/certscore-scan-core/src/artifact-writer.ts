import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { serializeCanonicalEvidenceArtifact } from "@certscore/contracts/dist/canonical-evidence-artifact.js";

export interface ArtifactWriter {
  baseDir: string;
  writeTextArtifact(filename: string, content: string): Promise<string>;
  writeJsonArtifact(filename: string, content: unknown): Promise<string>;
  artifactPath(filename: string): string;
}

export async function createArtifactWriter(baseDir: string): Promise<ArtifactWriter> {
  await mkdir(baseDir, { recursive: true });
  return {
    baseDir,
    artifactPath(filename: string): string {
      return path.join(baseDir, filename);
    },
    async writeTextArtifact(filename: string, content: string): Promise<string> {
      const artifactPath = path.join(baseDir, filename);
      await writeFile(artifactPath, content);
      return artifactPath;
    },
    async writeJsonArtifact(filename: string, content: unknown): Promise<string> {
      const artifactPath = path.join(baseDir, filename);
      const json = filename === "CanonicalEvidenceBundle.json"
        ? serializeCanonicalEvidenceArtifact(content, 2) : JSON.stringify(content, null, 2);
      await writeFile(artifactPath, `${json}\n`);
      return artifactPath;
    },
  };
}
