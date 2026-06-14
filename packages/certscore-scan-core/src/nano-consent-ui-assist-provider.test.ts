import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAiNanoConsentUiAssistProvider } from "./nano-consent-ui-assist-provider.js";

test("OpenAI Nano consent UI provider classifies only observed candidate IDs", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = createOpenAiNanoConsentUiAssistProvider({
    apiKey: "test-key",
    model: "test-nano",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              classifications: [
                {
                  actionId: "accept_all_flow_consent_control_0",
                  actionType: "accept_all",
                  confidence: 0.91,
                  shouldClick: true,
                  uncertaintyNotes: ["short fixture note"],
                },
                {
                  actionId: "invented_control",
                  actionType: "reject_all",
                  confidence: 0.99,
                  shouldClick: true,
                },
              ],
            }),
          },
        }],
      });
    },
  });

  const result = await provider.classifyControls({
    assistId: "assist_controls",
    pageUrl: "https://example.com/",
    candidates: [
      {
        actionId: "accept_all_flow_consent_control_0",
        labelText: "Continue",
        normalizedLabel: "continue",
        domLocation: "div>body>html",
        selectorSummary: "controlIndex:0",
      },
    ],
  });

  assert.equal(Array.isArray((requestBody?.messages as Array<{ content?: string }> | undefined)?.[1]?.content), false);
  assert.deepEqual(result.classifications.map((classification) => classification.actionId), [
    "accept_all_flow_consent_control_0",
  ]);
  assert.equal(result.classifications[0]?.actionType, "accept_all");
  assert.equal(result.classifications[0]?.shouldClick, true);
});

test("OpenAI Nano consent UI provider normalizes unsafe or weak classifications", async () => {
  const provider = createOpenAiNanoConsentUiAssistProvider({
    apiKey: "test-key",
    model: "test-nano",
    fetchImpl: async () => jsonResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            classifications: [
              {
                actionId: "reject_all_flow_consent_control_1",
                actionType: "not_allowed",
                confidence: 1.5,
                shouldClick: true,
                uncertaintyNotes: ["unsupported label"],
              },
              {
                actionId: "reject_all_flow_consent_control_2",
                actionType: "reject_all",
                confidence: 0.5,
                shouldClick: true,
              },
            ],
          }),
        },
      }],
    }),
  });

  const result = await provider.classifyControls({
    assistId: "assist_controls",
    pageUrl: "https://example.com/",
    candidates: [
      {
        actionId: "reject_all_flow_consent_control_1",
        labelText: "Maybe",
        normalizedLabel: "maybe",
      },
      {
        actionId: "reject_all_flow_consent_control_2",
        labelText: "Reject",
        normalizedLabel: "reject",
      },
    ],
  });

  assert.equal(result.classifications[0]?.actionType, "unknown");
  assert.equal(result.classifications[0]?.confidence, 1);
  assert.equal(result.classifications[0]?.shouldClick, false);
  assert.equal(result.classifications[1]?.actionType, "reject_all");
  assert.equal(result.classifications[1]?.shouldClick, false);
});

test("OpenAI Nano consent UI provider allows explicit high-confidence actions even when shouldClick is overly cautious", async () => {
  const provider = createOpenAiNanoConsentUiAssistProvider({
    apiKey: "test-key",
    model: "test-nano",
    fetchImpl: async () => jsonResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            classifications: [
              {
                actionId: "accept_all_flow_consent_control_1",
                actionType: "accept_all",
                confidence: 0.94,
                shouldClick: false,
              },
              {
                actionId: "reject_all_flow_consent_control_2",
                actionType: "reject_all",
                confidence: 0.9,
                shouldClick: false,
              },
            ],
          }),
        },
      }],
    }),
  });

  const result = await provider.classifyControls({
    assistId: "assist_controls",
    pageUrl: "https://example.com/",
    candidates: [
      {
        actionId: "accept_all_flow_consent_control_1",
        labelText: "Accept All",
        normalizedLabel: "accept all",
      },
      {
        actionId: "reject_all_flow_consent_control_2",
        labelText: "Reject Optional",
        normalizedLabel: "reject optional",
      },
    ],
  });

  assert.equal(result.classifications[0]?.shouldClick, true);
  assert.equal(result.classifications[1]?.shouldClick, true);
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
