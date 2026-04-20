import assert from "node:assert/strict";
import test from "node:test";

import {
  FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED,
  toFinancialCommercialClaimsJsonl
} from "./financial-commercial-claims.dataset";

test("financial commercial claims dataset seed includes train and eval examples", () => {
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length >= 6);
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.some((entry) => entry.split === "train"));
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.some((entry) => entry.split === "eval"));
  assert.ok(FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.some((entry) => typeof entry.sourceUrl === "string"));
});

test("financial commercial claims dataset jsonl exporter emits parseable rows", () => {
  const lines = toFinancialCommercialClaimsJsonl().trim().split("\n");

  assert.equal(lines.length, FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED.length);

  for (const line of lines) {
    const row = JSON.parse(line) as {
      messages: Array<{ content: string; role: string }>;
      metadata: { id: string; sourceUrl?: string | null; split: string };
    };

    assert.equal(row.messages.length, 3);
    assert.equal(row.messages[0]?.role, "system");
    assert.equal(row.messages[1]?.role, "user");
    assert.equal(row.messages[2]?.role, "assistant");
    assert.ok(typeof row.metadata.id === "string" && row.metadata.id.length > 0);
  }

  assert.ok(lines.some((line) => JSON.parse(line).metadata.sourceUrl));
});
