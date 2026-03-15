import { createBrowser } from "../browser/create-browser";
import { navigateWithPolicy } from "../browser/navigate-with-policy";
import type { RobotsPolicy } from "../robots/policy";
import {
  assessPolicyPageContentQuality,
  buildStaticPageResult
} from "./extractors";
import type { ScanPlan } from "./scan-planner";
import type { StaticPageResult } from "./types";

type ResolvedPolicyCandidate = {
  finalUrl: string;
  headers: Record<string, string>;
  html: string;
  source: "rendered_page" | "iframe" | "network_html" | "network_json";
  statusCode: number | null;
  textContent: string;
};

function normalizeResolvedText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function countResolvedWords(text: string) {
  return text.match(/\b[\w'-]+\b/g)?.length ?? 0;
}

function stripHtmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPolicyLikeUrl(url: string) {
  return /(privacy|policy|notice|cookie|terms|legal|gdpr|ccpa)/i.test(url);
}

function hasPolicyLikeText(text: string) {
  return /\bprivacy\b|\bpersonal information\b|\bdata subject\b|\bcollect\b|\bretain\b|\bcookies?\b|\bterms\b|\bconsumer privacy\b/i.test(text);
}

function extractPolicyTextFromJson(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const strings: string[] = [];

    const visit = (value: unknown, depth: number) => {
      if (depth > 6 || strings.length >= 200) {
        return;
      }

      if (typeof value === "string") {
        const normalized = normalizeResolvedText(value);
        if (normalized.length >= 40 && hasPolicyLikeText(normalized)) {
          strings.push(normalized);
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }

      if (value && typeof value === "object") {
        Object.values(value).forEach((item) => visit(item, depth + 1));
      }
    };

    visit(parsed, 0);
    return normalizeResolvedText(strings.join(" "));
  } catch {
    return "";
  }
}

function scoreResolvedPolicyCandidate(candidate: ResolvedPolicyCandidate) {
  const wordCount = countResolvedWords(candidate.textContent);
  const textLength = candidate.textContent.length;
  const policyTermBonus = hasPolicyLikeText(candidate.textContent) ? 120 : 0;
  const urlBonus = hasPolicyLikeUrl(candidate.finalUrl) ? 80 : 0;
  const sourceBonus =
    candidate.source === "iframe" ? 50 : candidate.source === "network_html" ? 35 : candidate.source === "network_json" ? 25 : 0;

  return textLength + wordCount * 4 + policyTermBonus + urlBonus + sourceBonus;
}

function toResolvedPolicyPage(input: {
  candidate: ResolvedPolicyCandidate;
  originalPage: StaticPageResult;
}): StaticPageResult {
  return buildStaticPageResult({
    blockedByPolicy: false,
    finalUrl: input.candidate.finalUrl,
    headers: input.candidate.headers,
    html: input.candidate.html,
    pageType: input.originalPage.pageType,
    pageUrl: input.originalPage.pageUrl,
    redirectCount: input.candidate.finalUrl !== input.originalPage.pageUrl ? 1 : input.originalPage.redirectCount,
    statusCode: input.candidate.statusCode ?? input.originalPage.statusCode,
    textContentOverride: input.candidate.textContent,
    timedOut: false
  });
}

function combineResolvedPolicyCandidates(candidates: ResolvedPolicyCandidate[]) {
  const unique = candidates.filter((candidate, index) => {
    const normalized = candidate.textContent.slice(0, 500);
    return candidates.findIndex((entry) => entry.finalUrl === candidate.finalUrl || entry.textContent.slice(0, 500) === normalized) === index;
  });

  if (unique.length < 2) {
    return null;
  }

  const mergedTextParts: string[] = [];
  const mergedHtmlParts: string[] = [];
  const seenSnippets = new Set<string>();

  for (const candidate of unique) {
    const snippetKey = candidate.textContent.slice(0, 500);
    if (seenSnippets.has(snippetKey)) {
      continue;
    }
    seenSnippets.add(snippetKey);
    mergedTextParts.push(candidate.textContent);
    mergedHtmlParts.push(candidate.html);
  }

  const textContent = normalizeResolvedText(mergedTextParts.join("\n\n"));
  if (countResolvedWords(textContent) <= countResolvedWords(unique[0]!.textContent) + 80) {
    return null;
  }

  return {
    finalUrl: unique[0]!.finalUrl,
    headers: unique[0]!.headers,
    html: mergedHtmlParts.join("\n"),
    source: unique[0]!.source,
    statusCode: unique[0]!.statusCode,
    textContent
  } satisfies ResolvedPolicyCandidate;
}

export async function renderThinPolicyPage(input: {
  page: StaticPageResult;
  plan: ScanPlan;
  robotsPolicy?: RobotsPolicy | null;
}): Promise<StaticPageResult | null> {
  const browserHandle = await createBrowser();
  const browserPage = await browserHandle.context.newPage();
  const networkCandidatePromises: Array<Promise<ResolvedPolicyCandidate | null>> = [];
  const observedPolicyResponseUrls = new Set<string>();
  const observedFrameUrls = new Set<string>();

  try {
    browserPage.on("response", (response) => {
      const status = response.status();
      if (status < 200 || status >= 300) {
        return;
      }

      const request = response.request();
      const resourceType = request.resourceType();
      const responseUrl = response.url();
      const headers = response.headers();
      const contentType = (headers["content-type"] ?? "").toLowerCase();
      const contentLength = Number.parseInt(headers["content-length"] ?? "", 10);

      if (!["document", "fetch", "xhr", "iframe"].includes(resourceType)) {
        return;
      }

      if (Number.isFinite(contentLength) && contentLength > 500_000) {
        return;
      }

      if (!hasPolicyLikeUrl(responseUrl) && !contentType.includes("json") && !contentType.includes("html") && !contentType.startsWith("text/")) {
        return;
      }

      if (hasPolicyLikeUrl(responseUrl)) {
        observedPolicyResponseUrls.add(responseUrl);
      }

      networkCandidatePromises.push(
        response
          .text()
          .then((body) => {
            if (!body) {
              return null;
            }

            const textContent = contentType.includes("json")
              ? extractPolicyTextFromJson(body)
              : normalizeResolvedText(stripHtmlToText(body));

            if (countResolvedWords(textContent) < 80 || !hasPolicyLikeText(textContent)) {
              return null;
            }

            return {
              finalUrl: responseUrl,
              headers,
              html: contentType.includes("json") ? `<pre>${body}</pre>` : body,
              source: contentType.includes("json") ? "network_json" : "network_html",
              statusCode: status,
              textContent
            } satisfies ResolvedPolicyCandidate;
          })
          .catch(() => null)
      );
    });

    browserPage.setDefaultNavigationTimeout(input.plan.browserNavigationTimeoutMs);
    browserPage.setDefaultTimeout(input.plan.browserNavigationTimeoutMs);
    const navigation = await navigateWithPolicy({
      page: browserPage,
      robotsPolicy: input.robotsPolicy,
      url: input.page.pageUrl
    });

    if (navigation.blockedByPolicy) {
      return null;
    }

    await browserPage.waitForTimeout(input.plan.browserPostLoadWaitMs);
    const html = await browserPage.content().catch(() => "");
    const textContent = normalizeResolvedText(
      await browserPage
        .evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").trim() ?? document.documentElement?.innerText?.replace(/\s+/g, " ").trim() ?? "")
        .catch(() => "")
    );
    const finalUrl = browserPage.url() || input.page.finalUrl || input.page.pageUrl;
    const headers =
      (await navigation.response?.allHeaders().catch(() => null)) ??
      navigation.response?.headers() ??
      input.page.headers;
    const renderedCandidate: ResolvedPolicyCandidate = {
      finalUrl,
      headers,
      html,
      source: "rendered_page",
      statusCode: navigation.response?.status() ?? input.page.statusCode,
      textContent
    };
    const frameCandidates = await Promise.all(
      browserPage.frames().slice(1).map(async (frame): Promise<ResolvedPolicyCandidate | null> => {
        const frameUrl = frame.url();
        if (!frameUrl) {
          return null;
        }

        observedFrameUrls.add(frameUrl);

        const frameHtml = await frame.content().catch(() => "");
        const frameText = normalizeResolvedText(
          await frame
            .evaluate(() => document.body?.innerText?.replace(/\s+/g, " ").trim() ?? document.documentElement?.innerText?.replace(/\s+/g, " ").trim() ?? "")
            .catch(() => "")
        );

        if (countResolvedWords(frameText) < 80 || (!hasPolicyLikeText(frameText) && !hasPolicyLikeUrl(frameUrl))) {
          return null;
        }

        return {
          finalUrl: frameUrl,
          headers: {},
          html: frameHtml,
          source: "iframe",
          statusCode: 200,
          textContent: frameText
        };
      })
    );
    const networkCandidates = (await Promise.all(networkCandidatePromises)).filter(
      (candidate): candidate is ResolvedPolicyCandidate => Boolean(candidate)
    );
    const existingQuality = assessPolicyPageContentQuality(input.page);
    const iframeCandidates = frameCandidates.filter((candidate): candidate is ResolvedPolicyCandidate => Boolean(candidate));
    const candidates = [renderedCandidate, ...iframeCandidates, ...networkCandidates];
    const rankedCandidates = candidates
      .map((candidate) => ({
        candidate,
        score: scoreResolvedPolicyCandidate(candidate)
      }))
      .sort((left, right) => right.score - left.score);
    const bestCandidate = rankedCandidates[0]?.candidate;

    if (!bestCandidate) {
      return null;
    }

    const combinedCandidate = combineResolvedPolicyCandidates(rankedCandidates.slice(0, 3).map((entry) => entry.candidate));
    const selectedCandidate =
      combinedCandidate && scoreResolvedPolicyCandidate(combinedCandidate) > scoreResolvedPolicyCandidate(bestCandidate) + 120
        ? combinedCandidate
        : bestCandidate;

    const bestResolvedPage = toResolvedPolicyPage({
      candidate: selectedCandidate,
      originalPage: input.page
    });
    const renderedQuality = assessPolicyPageContentQuality(bestResolvedPage);

    if (
      bestResolvedPage.textContent.trim().length <= input.page.textContent.trim().length &&
      renderedQuality.wordCount <= existingQuality.wordCount
    ) {
      return null;
    }

    return bestResolvedPage;
  } finally {
    await browserPage.close().catch(() => undefined);
    await browserHandle.context.close().catch(() => undefined);
    await browserHandle.browser.close().catch(() => undefined);
  }
}

export async function upgradeThinPolicyPages(input: {
  fetchedPagesByUrl: Map<string, StaticPageResult>;
  plan: ScanPlan;
  robotsPolicy?: RobotsPolicy | null;
}) {
  const candidates = [...input.fetchedPagesByUrl.values()].filter((page) => {
    if (!(page.fetchStatus === "ok" || page.fetchStatus === "redirected")) {
      return false;
    }

    return assessPolicyPageContentQuality(page).insufficientContent;
  });

  for (const candidate of candidates) {
    try {
      const rendered = await renderThinPolicyPage({
        page: candidate,
        plan: input.plan,
        robotsPolicy: input.robotsPolicy
      });

      if (rendered) {
        input.fetchedPagesByUrl.set(candidate.pageUrl, rendered);
      }
    } catch {
      continue;
    }
  }
}
