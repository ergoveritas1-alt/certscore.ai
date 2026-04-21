import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const SCRIPT_PATH = "/Users/benmasek/WC01/scripts/eval-financial-claims-corpus.ts";

function runScript(args: string[]) {
  return execFileSync(process.execPath, ["--enable-source-maps", "--import", "tsx", SCRIPT_PATH, ...args], {
    cwd: "/Users/benmasek/WC01",
    encoding: "utf8"
  });
}

test("financial claims corpus script emits aligned JSON summary", () => {
  const output = runScript(["--json"]);
  const payload = JSON.parse(output) as {
    aligned: boolean;
    corpus: { trainCount: number; evalCount: number };
    corpusHealthIssues: string[];
    evaluation: { overallMatchCount: number; evaluatedCount: number };
    healthy: boolean;
    strict: boolean;
  };

  assert.equal(payload.aligned, true);
  assert.equal(payload.healthy, true);
  assert.deepEqual(payload.corpusHealthIssues, []);
  assert.equal(payload.strict, false);
  assert.equal(payload.corpus.trainCount > 0, true);
  assert.equal(payload.corpus.evalCount > 0, true);
  assert.equal(payload.evaluation.overallMatchCount, payload.evaluation.evaluatedCount);
});

test("financial claims corpus script emits markdown summary", () => {
  const output = runScript(["--markdown"]);

  assert.match(output, /^## Financial Claims Corpus/m);
  assert.match(output, /- Alignment: pass \(13\/13\)/);
  assert.match(output, /### Buckets/);
  assert.match(output, /### Deterministic Eval/);
});

test("financial claims corpus script emits jsonl corpus rows", () => {
  const output = runScript(["--jsonl"]);
  const lines = output.trim().split("\n");
  const firstRow = JSON.parse(lines[0] ?? "{}") as {
    messages?: Array<{ role: string }>;
    metadata?: { id?: string; expectedFindingIds?: string[] };
  };

  assert.equal(lines.length, 13);
  assert.equal(firstRow.messages?.length, 3);
  assert.equal(firstRow.messages?.[0]?.role, "system");
  assert.ok(typeof firstRow.metadata?.id === "string" && firstRow.metadata.id.length > 0);
  assert.ok(Array.isArray(firstRow.metadata?.expectedFindingIds));
});

test("financial claims corpus script strict mode passes on aligned seed corpus", () => {
  const output = runScript(["--strict"]);

  assert.match(output, /Corpus health\nok/);
  assert.match(output, /overall: 13\/13/);
});
