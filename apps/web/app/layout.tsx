import { Suspense } from "react";
import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";
import "../components/scans/runtime-evidence-graph.css";
import { AnalyticsConsentBanner } from "../components/analytics/analytics-consent-banner";
import { DataLayerClickTracker } from "../components/analytics/data-layer-events";
import { ProductAnalyticsTracker } from "../components/analytics/product-analytics-tracker";
import { buildConsentBootstrapScript } from "../lib/analytics/consent-bootstrap";
import { CORE_MARKETING_SUPPORT_EMAIL } from "../lib/marketing/core-positioning";
import { SITE_NAME, SITE_ORGANIZATION_ID, SITE_URL, SITE_WEBSITE_ID } from "../lib/seo";
import { getCertScoreSocialProfileUrls } from "../lib/social";

const GOOGLE_TAG_ID = process.env.NODE_ENV === "production" ? "G-B6TQVX35ZB" : "";
const UMAMI_SCRIPT_URL = "https://cloud.umami.is/script.js";
const UMAMI_WEBSITE_ID = process.env.NODE_ENV === "production"
  ? "8638201f-1970-4229-9239-95a23a0bdb1c"
  : "";
const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const bingSiteVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`
  },
  description: "Evidence-led website privacy scanning for GDPR/ePrivacy and CCPA reviews. Inspect cookies, trackers, consent behavior and privacy disclosures with CertScore.ai.",
  applicationName: SITE_NAME,
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  },
  openGraph: {
    siteName: SITE_NAME,
    images: [{ url: `${SITE_URL}/images/social/website-privacy-scanner.png`, width: 1200, height: 630, alt: "CertScore.ai website privacy scanner" }],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    images: [`${SITE_URL}/images/social/website-privacy-scanner.png`]
  },
  verification: {
    ...(googleSiteVerification ? { google: googleSiteVerification } : {}),
    ...(bingSiteVerification
      ? {
          other: {
            "msvalidate.01": bingSiteVerification
          }
        }
      : {})
  }
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": SITE_ORGANIZATION_ID,
    name: SITE_NAME,
    legalName: "CertScore.ai, LLC",
    url: SITE_URL,
    logo: `${SITE_URL}/certscore-header-logo.png`,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: CORE_MARKETING_SUPPORT_EMAIL,
      url: `${SITE_URL}/contact-sales`
    },
    sameAs: getCertScoreSocialProfileUrls()
  };
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: metadata.description,
    publisher: { "@id": SITE_ORGANIZATION_ID }
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="certscore-consent-bootstrap" strategy="beforeInteractive">
          {buildConsentBootstrapScript(GOOGLE_TAG_ID, {
            domains: ["certscore.ai", "www.certscore.ai"],
            scriptUrl: UMAMI_SCRIPT_URL,
            websiteId: UMAMI_WEBSITE_ID
          })}
        </Script>
        <Suspense fallback={null}><DataLayerClickTracker /></Suspense>
        <ProductAnalyticsTracker />
        <AnalyticsConsentBanner />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
        {children}
      </body>
    </html>
  );
}
