"use server";

import { z } from "zod";
import { getDashboardContext } from "../auth";

const inputSchema = z.object({
  query: z.string().trim().min(1).max(200)
});

const GOOGLE_CUSTOM_SEARCH_API_URL = "https://www.googleapis.com/customsearch/v1";
const MAX_RESULTS = 50;
const PAGE_SIZE = 10;

type GoogleCustomSearchResponse = {
  error?: {
    code?: number;
    message?: string;
  };
  items?: Array<{
    link?: string;
  }>;
};

export async function generateGoogleQueryUrls(query: string) {
  await getDashboardContext();

  const parsed = inputSchema.parse({ query });
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    throw new Error("Google Custom Search is not configured. Set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID.");
  }

  const urls: string[] = [];
  const seen = new Set<string>();

  for (let start = 1; start <= MAX_RESULTS; start += PAGE_SIZE) {
    const searchParams = new URLSearchParams({
      key: apiKey,
      cx: searchEngineId,
      num: String(PAGE_SIZE),
      q: parsed.query,
      start: String(start)
    });

    const response = await fetch(`${GOOGLE_CUSTOM_SEARCH_API_URL}?${searchParams.toString()}`, {
      cache: "no-store"
    });

    const payload = (await response.json()) as GoogleCustomSearchResponse;

    if (!response.ok) {
      const detail = payload.error?.message?.trim();
      throw new Error(detail ? `Google search request failed: ${detail}` : `Google search request failed with status ${response.status}.`);
    }

    const pageItems = payload.items ?? [];

    if (pageItems.length === 0) {
      break;
    }

    for (const item of pageItems) {
      const url = item.link?.trim();

      if (!url || seen.has(url)) {
        continue;
      }

      seen.add(url);
      urls.push(url);

      if (urls.length >= MAX_RESULTS) {
        return urls;
      }
    }
  }

  return urls;
}
