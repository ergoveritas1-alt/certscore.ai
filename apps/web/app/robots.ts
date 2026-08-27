import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo";

const publicAllowPaths = [
  "/",
  "/how-it-works",
  "/methodology",
  "/what-is-certscore",
  "/pricing",
  "/press",
  "/releases",
  "/releases/",
  "/guides",
  "/guides/",
  "/benchmarks",
  "/benchmarks/",
  "/compare",
  "/compare/",
  "/developers",
  "/developers/",
  "/.well-known/certscore-ai.json",
  "/api/v2/health",
  "/api/v2/openapi.json",
  "/api/v2/scans/",
  "/api/v2/domains/",
  "/book-demo",
  "/contact",
  "/contact-sales",
  "/faq",
  "/findings",
  "/findings/",
  "/insights/",
  "/llms.txt",
  "/llms-full.txt",
  "/sample-report",
  "/trust",
  "/solutions",
  "/solutions/"
];

const privateDisallowPaths = ["/app/", "/api/", "/auth/", "/dashboard/", "/account/", "/admin/", "/private/"];
const infrastructureDisallowPaths = ["/cdn-cgi/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: publicAllowPaths,
        disallow: [...privateDisallowPaths, ...infrastructureDisallowPaths]
      },
      {
        userAgent: [
          "OAI-SearchBot",
          "ChatGPT-User",
          "GPTBot",
          "Googlebot",
          "Google-Extended",
          "GoogleOther",
          "ClaudeBot",
          "Claude-User",
          "Claude-SearchBot",
          "anthropic-ai",
          "PerplexityBot",
          "Perplexity-User",
          "bingbot",
          "BingPreview",
          "Applebot",
          "Meta-ExternalAgent",
          "FacebookBot",
          "MistralAI-User",
          "DeepSeekBot",
          "KimiBot",
          "QwenBot",
          "GrokBot",
          "CCBot"
        ],
        allow: publicAllowPaths,
        disallow: [...privateDisallowPaths, ...infrastructureDisallowPaths]
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
