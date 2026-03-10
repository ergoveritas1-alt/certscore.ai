import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/how-it-works", "/pricing", "/guides", "/guides/", "/faq", "/insights/"],
        disallow: ["/app/", "/api/", "/auth/"]
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
