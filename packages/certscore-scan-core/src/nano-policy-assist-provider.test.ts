import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAiNanoPolicyAssistProvider } from "./nano-policy-assist-provider.js";

test("OpenAI Nano policy provider ranks only observed candidate IDs", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = createOpenAiNanoPolicyAssistProvider({
    apiKey: "test-key",
    model: "test-nano",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              rankedCandidates: [
                {
                  candidateId: "policy_candidate_2",
                  likelySurfaceType: "your_privacy_choices",
                  shouldFetch: true,
                  priorityRank: 1,
                  confidence: 0.93,
                  reason: "Observed choices center link.",
                  uncertaintyNotes: ["short ambiguous text"],
                },
                {
                  candidateId: "invented_candidate",
                  likelySurfaceType: "privacy_policy",
                  shouldFetch: true,
                  priorityRank: 2,
                  confidence: 0.99,
                  reason: "Should be ignored.",
                },
                {
                  candidateId: "policy_candidate_3",
                  likelySurfaceType: "privacy_policy",
                  shouldFetch: true,
                  priorityRank: 3,
                  confidence: 0.86,
                  reason: "Exact common privacy path.",
                },
                {
                  candidateId: "policy_candidate_4",
                  likelySurfaceType: "privacy_policy",
                  shouldFetch: true,
                  priorityRank: 4,
                  confidence: 0.8,
                  reason: "Common path guess below threshold.",
                },
              ],
            }),
          },
        }],
      });
    },
  });

  const result = await provider.classifyLinks?.({
    assistId: "assist_links",
    pageUrl: "https://example.com/",
    candidates: [
      {
        candidateId: "policy_candidate_1",
        url: "/account",
        normalizedUrl: "https://example.com/account",
        linkText: "Account",
        domLocation: "body",
        sameOrigin: true,
        deterministicSurfaceType: "unknown",
        deterministicScore: 0.1,
        deterministicKeywordMatches: [],
        discoveryMethod: "page_text_link",
      },
      {
        candidateId: "policy_candidate_2",
        url: "/controls",
        normalizedUrl: "https://example.com/controls",
        linkText: "Choices",
        surroundingTextExcerpt: "Footer: Choices",
        domLocation: "footer",
        sameOrigin: true,
        deterministicSurfaceType: "unknown",
        deterministicScore: 0.1,
        deterministicKeywordMatches: [],
        discoveryMethod: "footer_link",
      },
      {
        candidateId: "policy_candidate_3",
        url: "/privacy-policy",
        normalizedUrl: "https://example.com/privacy-policy",
        linkText: "privacy policy",
        domLocation: "body",
        sameOrigin: true,
        fetchable: true,
        clickable: false,
        mayLeadToConsentControls: false,
        observationOnly: false,
        deterministicSurfaceType: "privacy_policy",
        deterministicScore: 0.7,
        deterministicKeywordMatches: ["privacy"],
        discoveryMethod: "guessed_common_path",
      },
      {
        candidateId: "policy_candidate_4",
        url: "/privacy",
        normalizedUrl: "https://example.com/privacy",
        linkText: "privacy",
        domLocation: "body",
        sameOrigin: true,
        deterministicSurfaceType: "privacy_policy",
        deterministicScore: 0.7,
        deterministicKeywordMatches: ["privacy"],
        discoveryMethod: "guessed_common_path",
      },
    ],
  });

  const userPayload = JSON.parse(String((requestBody?.messages as Array<{ content?: string }> | undefined)?.[1]?.content)) as {
    candidates: Array<{
      candidateId: string;
      discoveryMethod?: string;
      fetchable?: boolean;
      clickable?: boolean;
      mayLeadToConsentControls?: boolean;
      observationOnly?: boolean;
    }>;
  };
  assert.equal(userPayload.candidates.some((candidate) => candidate.discoveryMethod === "guessed_common_path"), true);
  assert.equal(userPayload.candidates.some((candidate) => "observationOnly" in candidate), true);
  assert.deepEqual(result?.rankedCandidates.map((candidate) => candidate.candidateId), ["policy_candidate_2", "policy_candidate_3"]);
  assert.equal(result?.rankedCandidates[0]?.likelySurfaceType, "your_privacy_choices");
});

test("OpenAI Nano policy provider normalizes topic extraction to allowed bounded fields", async () => {
  const provider = createOpenAiNanoPolicyAssistProvider({
    apiKey: "test-key",
    model: "test-nano",
    fetchImpl: async () => jsonResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            observedTopics: ["global_privacy_control", "not_allowed"],
            mentionedVendors: ["LiveRamp", ""],
            mentionedPurposes: ["targeted advertising"],
            mentionedRights: ["opt out"],
            mentionedControls: ["GPC"],
            confidence: 1.5,
            uncertaintyNotes: ["bounded excerpt only"],
          }),
        },
      }],
    }),
  });

  const result = await provider.extractTopics?.({
    assistId: "assist_topics",
    surfaceUrl: "https://example.com/privacy-choices",
    surfaceType: "your_privacy_choices",
    title: "Your Privacy Choices",
    excerpt: "We honor Global Privacy Control and work with LiveRamp.",
    deterministicTopicHits: [],
  });

  assert.deepEqual(result?.observedTopics, ["global_privacy_control"]);
  assert.deepEqual(result?.mentionedVendors, ["LiveRamp"]);
  assert.equal(result?.confidence, 1);
});

test("OpenAI Nano policy provider aborts slow requests", async () => {
  const provider = createOpenAiNanoPolicyAssistProvider({
    apiKey: "test-key",
    model: "test-nano",
    timeoutMs: 20,
    fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }),
  });

  await assert.rejects(
    () => provider.classifyLinks?.({
      assistId: "assist_links",
      pageUrl: "https://example.com/",
      candidates: [],
    }),
    /timed out after 1000ms/,
  );
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
