import assert from "node:assert/strict";
import test from "node:test";
import { validateFinancialFindingWithLlm, validateFindingWithLlm } from "./llm-client";

const ORIGINAL_FETCH = global.fetch;
const REQUIRED_ENV = {
  DATABASE_URL: "postgres://example.com/test",
  OPENAI_API_KEY: "test-key",
  VALIDATION_OPENAI_MODEL: "test-primary-model",
  VALIDATION_NANO_MODEL: "gpt-5.4-nano"
};

function withEnv(callback: () => Promise<void> | void) {
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    VALIDATION_OPENAI_MODEL: process.env.VALIDATION_OPENAI_MODEL,
    VALIDATION_NANO_MODEL: process.env.VALIDATION_NANO_MODEL
  };

  Object.assign(process.env, REQUIRED_ENV);

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("validateFindingWithLlm retries quota failures on nano model", async () => {
  const seenModels: string[] = [];

  await withEnv(async () => {
    global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      seenModels.push(String(payload.model ?? ""));

      if (payload.model === "test-primary-model") {
        return new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({
          model: "gpt-5.4-nano",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verdict: "supported",
                  confidence: 0.91,
                  rationale: "Direct support.",
                  evidence: { snippet: "earn 20% monthly" }
                })
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }) as typeof fetch;

    const result = await validateFindingWithLlm({
      domain: "example.com",
      finding: { ruleKey: "financial_review.earnings_claim_without_adjacent_disclosure" },
      scanEvidence: { snippets: ["earn 20% monthly"] }
    });

    assert.deepEqual(seenModels, ["test-primary-model", "gpt-5.4-nano"]);
    assert.equal(result.model, "gpt-5.4-nano");
    assert.equal(result.verdict, "supported");
  });
});

test("validateFinancialFindingWithLlm degrades to audit-only when both models fail", async () => {
  await withEnv(async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch;

    const result = await validateFinancialFindingWithLlm({
      candidateFindingId: "past_performance_disclaimer_present",
      evidence: {
        exactMatchTerm: "past results",
        matchedPhrases: ["past results"],
        pageClassification: "disclosure_or_legal",
        pageUrl: "https://example.com/disclosure",
        signalKeys: ["financial.past_performance_disclaimer_text_present"],
        snippets: ["Past results do not guarantee future performance."],
        sourceUrls: ["https://example.com/disclosure"],
        supportingHeadings: ["Risk disclosure"]
      },
      negativeEvidenceFlags: [],
      scanContext: {
        domain: "example.com",
        pageType: "homepage"
      }
    });

    assert.equal(result.model, "gpt-5.4-nano");
    assert.equal(result.verdict, "inconclusive");
    assert.match(result.rationale, /downgraded to audit-only/i);
  });
});

test.after(() => {
  global.fetch = ORIGINAL_FETCH;
});
