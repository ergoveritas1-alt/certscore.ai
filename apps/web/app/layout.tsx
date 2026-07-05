import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";
import { AnalyticsConsentBanner } from "../components/analytics/analytics-consent-banner";
import { DataLayerClickTracker } from "../components/analytics/data-layer-events";
import { buildConsentBootstrapScript } from "../lib/analytics/consent-bootstrap";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../lib/seo";

const GOOGLE_TAG_ID = "G-B6TQVX35ZB";
const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const bingSiteVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`
  },
  description: SITE_DESCRIPTION,
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
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="certscore-consent-bootstrap" strategy="beforeInteractive">
          {buildConsentBootstrapScript(GOOGLE_TAG_ID)}
        </Script>
        <DataLayerClickTracker />
        <AnalyticsConsentBanner />
        {children}
      </body>
    </html>
  );
}
