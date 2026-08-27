import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";
import { AnalyticsConsentBanner } from "../components/analytics/analytics-consent-banner";
import { DataLayerClickTracker } from "../components/analytics/data-layer-events";
import { ProductAnalyticsTracker } from "../components/analytics/product-analytics-tracker";
import { buildConsentBootstrapScript } from "../lib/analytics/consent-bootstrap";
import { SITE_NAME, SITE_URL } from "../lib/seo";
import { getCertScoreSocialProfileUrls } from "../lib/social";

const GOOGLE_TAG_ID = "G-B6TQVX35ZB";
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
  description: "CertScore.ai scans public websites for observable accessibility, privacy, and disclosure signals and tracks changes over time.",
  applicationName: SITE_NAME,
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  },
  openGraph: {
    siteName: SITE_NAME,
    type: "website"
  },
  twitter: {
    card: "summary_large_image"
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
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/certscore-header-logo.png`,
    sameAs: getCertScoreSocialProfileUrls()
  };
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: metadata.description
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
        <DataLayerClickTracker />
        <ProductAnalyticsTracker />
        <AnalyticsConsentBanner />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
        {children}
      </body>
    </html>
  );
}
