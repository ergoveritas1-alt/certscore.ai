import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo";

const publicAllowPaths = [
  "/",
  "/how-it-works",
  "/methodology",
  "/what-is-certscore",
  "/pricing",
  "/press",
  "/guides",
  "/guides/",
  "/benchmarks",
  "/benchmarks/",
  "/compare",
  "/compare/",
  "/faq",
  "/insights/",
  "/llms.txt"
];

const privateDisallowPaths = ["/app/", "/api/", "/auth/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: publicAllowPaths,
        disallow: privateDisallowPaths
      },
      {
        userAgent: [
          "OAI-SearchBot",
          "ChatGPT-User",
          "GPTBot",
          "Googlebot",
          "Google-Extended",
          "ClaudeBot",
          "Claude-User",
          "Claude-SearchBot",
          "anthropic-ai"
        ],
        allow: publicAllowPaths,
        disallow: privateDisallowPaths
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
