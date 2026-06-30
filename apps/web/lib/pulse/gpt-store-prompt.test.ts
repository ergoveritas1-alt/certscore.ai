import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootPromptPath = "gpt-store/certscore-gpt-system-prompt.md";
const publicPromptPath = "apps/web/public/gpt-store/certscore-gpt-system-prompt.md";

test("CertScore GPT Store prompt stays aligned with the ChatGPT Action contract", () => {
  const rootPrompt = readFileSync(rootPromptPath, "utf8");
  const publicPrompt = readFileSync(publicPromptPath, "utf8");

  assert.equal(publicPrompt, rootPrompt);
  assert.match(rootPrompt, /GDPR\/ePrivacy Consent Scanner/);
  assert.match(rootPrompt, /getPulseForUrl Action/);
  assert.match(rootPrompt, /format: markdown/);
  assert.match(rootPrompt, /detail: standard/);
  assert.match(rootPrompt, /wait: 35/);
  assert.match(rootPrompt, /scanFrom: eu_ie or california/);
  assert.match(rootPrompt, /checkPulseConnectivity/);
  assert.match(rootPrompt, /\/api\/v1\/pulse\/gpt\?url=<URL>&format=markdown&detail=standard&wait=35/);
  assert.match(rootPrompt, /not legal advice, certification, or a compliance determination/);
  assert.doesNotMatch(rootPrompt, /wait:\s*60|wait=60/);
  assert.doesNotMatch(rootPrompt, /eu_de/);
  assert.doesNotMatch(rootPrompt, /CCPA|CPRA/i);
  assert.doesNotMatch(rootPrompt, /compliant, non-compliant, certified, illegal, or violates law[\s\S]*CertScore returned an API error, no report, no jobId, or no findings[\s\S]*without visible CertScore diagnostic headers/);
});
