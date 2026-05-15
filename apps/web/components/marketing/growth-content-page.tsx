import type { Metadata } from "next";
import { SiteFooter } from "../layout/site-footer";
import { SiteHeader } from "../layout/site-header";
import { AiVisibilityContent } from "./ai-visibility-content";
import {
  createBreadcrumbSchema,
  createPageMetadata,
  createPublicArticleSchema,
  createPublicWebPageSchema
} from "../../lib/seo";

type GrowthSection = {
  title: string;
  paragraphs: string[];
};

type GrowthLink = {
  href: string;
  label: string;
};

export type GrowthContentPageConfig = {
  badge: string;
  description: string;
  intro: string;
  path: string;
  relatedLinks: GrowthLink[];
  sections: GrowthSection[];
  title: string;
  type: "Guide" | "Comparison";
};

export function createGrowthPageMetadata(config: GrowthContentPageConfig): Metadata {
  return {
    ...createPageMetadata({
      title: config.title,
      description: config.description,
      path: config.path
    }),
    title: {
      absolute: `${config.title} | CertScore.ai`
    }
  };
}

export function GrowthContentPage({ config }: { config: GrowthContentPageConfig }) {
  const parentPath = config.type === "Comparison" ? "/compare" : "/guides";
  const parentName = config.type === "Comparison" ? "Compare" : "Guides";
  const schema = [
    createPublicWebPageSchema({
      title: config.title,
      description: config.description,
      path: config.path
    }),
    createPublicArticleSchema({
      title: config.title,
      description: config.description,
      path: config.path,
      type: "TechArticle",
      about: ["website scanning", "consent behavior", "cookies", "tracking", "runtime review"]
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: parentName, path: parentPath },
      { name: config.title, path: config.path }
    ])
  ];
  const content = (
    <AiVisibilityContent
      badge={config.badge}
      intro={config.intro}
      relatedLinks={config.relatedLinks}
      schema={schema}
      sections={config.sections}
      title={config.title}
    />
  );

  if (config.type === "Guide") {
    return content;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      {content}
      <SiteFooter />
    </main>
  );
}
