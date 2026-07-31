import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  independentPolicyReviewPacketSchema,
  independentPolicyReviewResponseSchema,
  mergeIndependentPolicyReviewResponses,
  type IndependentPolicyReviewPacket,
  type IndependentPolicyReviewResponse
} from "../src/validation/model-review-independent-review";
import { policyReviewGoldCorpusSchema } from "../src/validation/model-review-gold-corpus";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function listFiles(root: string, suffix: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return listFiles(entryPath, suffix);
      }
      return entry.isFile() && entry.name.endsWith(suffix) ? [entryPath] : [];
    })
  );
  return nested.flat().sort();
}

async function parseFiles<T>(
  filePaths: string[],
  parse: (value: unknown) => T
): Promise<T[]> {
  return Promise.all(
    filePaths.map(async (filePath) =>
      parse(JSON.parse(await readFile(filePath, "utf8")))
    )
  );
}

async function main() {
  const corpusPath = path.resolve(
    getArgValue("--corpus") ?? "fixtures/policy-review-gold-corpus.v1.json"
  );
  const reviewDir = path.resolve(
    getArgValue("--review-dir") ?? "artifacts/policy-review-independent-v1"
  );
  const outPath = path.resolve(
    getArgValue("--out") ??
      "fixtures/policy-review-gold-corpus.v1.review-candidate.json"
  );
  if (outPath === corpusPath) {
    throw new Error("Refusing to overwrite the canonical corpus; write a review candidate first.");
  }
  const corpus = policyReviewGoldCorpusSchema.parse(
    JSON.parse(await readFile(corpusPath, "utf8"))
  );
  const [packetPaths, responsePaths] = await Promise.all([
    listFiles(reviewDir, ".packet.json"),
    listFiles(reviewDir, ".response.json")
  ]);
  const packets = await parseFiles<IndependentPolicyReviewPacket>(
    packetPaths,
    (value) => independentPolicyReviewPacketSchema.parse(value)
  );
  const responses = await parseFiles<IndependentPolicyReviewResponse>(
    responsePaths,
    (value) => independentPolicyReviewResponseSchema.parse(value)
  );
  if (responses.length === 0) {
    throw new Error(`No completed independent response files found in ${reviewDir}.`);
  }
  const merged = policyReviewGoldCorpusSchema.parse(
    mergeIndependentPolicyReviewResponses({ corpus, packets, responses })
  );
  await writeFile(outPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    corpusPath,
    reviewDir,
    outPath,
    packetCount: packets.length,
    responseCount: responses.length,
    independentlyReviewedCaseCount: merged.entries.filter(
      (entry) => entry.reviewStatus === "independently_reviewed"
    ).length,
    productionEligible: false
  }, null, 2));
}

void main().catch((error) => {
  console.error(
    "[ingest-independent-policy-review]",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
