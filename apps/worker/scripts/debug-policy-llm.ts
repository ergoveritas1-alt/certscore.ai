import {
  chunkPolicyText,
  fetchTextPage,
  loadPolicyPrompt,
  POLICY_EXTRACTION_CONFIG,
  ruleBasedPolicyPreprocess,
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

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const fenced = fencedMatch[1].trim();
    if (fenced.startsWith("{") && fenced.endsWith("}")) {
      return fenced;
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

async function main() {
  const policyUrl = process.argv[2]?.trim() || "https://www.wbdprivacy.com/policycenter/b2c/";
  const chunkIndex = Number.parseInt(process.argv[3] ?? "0", 10) || 0;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const fetched = await fetchTextPage(policyUrl, 5);
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
  const chunk = chunks[chunkIndex];

  if (!chunk) {
    throw new Error(`Chunk index ${chunkIndex} is out of range; found ${chunks.length} chunk(s)`);
  }

  const promptText = loadPolicyPrompt("policy_extraction_v1.txt");
  const exampleJson = loadPolicyPrompt("policy_extraction_v1_example.json");
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
    throw new Error(`OpenAI request failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`);
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
  const rawJson = extractJsonObject(rawContent);

  console.log(
    JSON.stringify(
      {
        policyUrl,
        finalUrl: fetched.finalUrl,
        chunkCount: chunks.length,
        chunkIndex,
        chunkId: chunk.chunkId,
        chunkTextLength: chunk.text.length,
        rawContent,
        rawJson
      },
      null,
      2
    )
  );

  try {
    const validated = validatePolicyChunkJson({
      chunkText: chunk.text,
      rawJson
    });
    console.log(JSON.stringify({ validation: "ok", validated }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ validation: "failed", error: String(error) }, null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
