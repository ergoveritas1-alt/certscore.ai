import {
  chunkPolicyText,
  fetchTextPage,
  loadPolicyPrompt,
  POLICY_EXTRACTION_CONFIG,
  ruleBasedPolicyPreprocess,
  selectPolicyChunksForLlm,
  validatePolicyChunkJson
} from "@website-signal-risk-scanner/scan-core";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const policyUrl = process.argv[2]?.trim();
  const requestedChunkId = process.argv[3]?.trim() || null;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!policyUrl) {
    throw new Error("Usage: replay-policy-llm-chunks.ts <policy-url> [chunk-id]");
  }

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const fetched = await fetchTextPage(policyUrl, 5, { bypassRobots: true });
  if (!fetched.body) {
    throw new Error(`Failed to fetch policy page ${policyUrl}`);
  }

  const textContent = stripTags(fetched.body);
  const ruleResult = ruleBasedPolicyPreprocess({
    html: fetched.body,
    text: textContent
  });
  const chunks = chunkPolicyText({
    text: ruleResult.normalizedText
  });
  const selectedChunks = selectPolicyChunksForLlm({
    chunks
  });
  const chunksToReplay = requestedChunkId
    ? selectedChunks.filter((chunk) => chunk.chunkId === requestedChunkId)
    : selectedChunks;

  if (requestedChunkId && chunksToReplay.length === 0) {
    throw new Error(`Selected chunk ${requestedChunkId} was not found in chosen LLM chunks.`);
  }
  const promptText = loadPolicyPrompt("policy_extraction_v1.txt");
  const exampleJson = loadPolicyPrompt("policy_extraction_v1_example.json");
  const results: Array<Record<string, unknown>> = [];

  for (const chunk of chunksToReplay) {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: POLICY_EXTRACTION_CONFIG.model,
        temperature: POLICY_EXTRACTION_CONFIG.temperature,
        max_completion_tokens: POLICY_EXTRACTION_CONFIG.maxTokens,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content: promptText
          },
          {
            role: "assistant",
            content: exampleJson
          },
          {
            role: "user",
            content: `CHUNK_ID: ${chunk.chunkId}\nTEXT:\n${chunk.text}`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`OpenAI request failed for ${chunk.chunkId} with ${response.status}${errorBody ? `: ${errorBody}` : ""}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string; type?: string }>;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    const rawContent =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((item) => (item && typeof item.text === "string" ? item.text : ""))
              .join("")
              .trim()
          : "";

    try {
      validatePolicyChunkJson({
        chunkText: chunk.text,
        rawJson: rawContent
      });
      results.push({
        chunkId: chunk.chunkId,
        ok: true,
        rawLength: rawContent.length,
        selectedReason: chunk.reason,
        score: chunk.score
      });
    } catch (error) {
      results.push({
        chunkId: chunk.chunkId,
        ok: false,
        rawLength: rawContent.length,
        selectedReason: chunk.reason,
        score: chunk.score,
        rawContent,
        error: String(error)
      });
      break;
    }
  }

  console.log(
    JSON.stringify(
      {
        chunkCount: chunks.length,
        selectedChunkCount: selectedChunks.length,
        finalUrl: fetched.finalUrl,
        policyUrl,
        results
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
