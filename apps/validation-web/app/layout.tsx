import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SITE_URL } from "../lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Validation Ops",
    template: `%s | Validation Ops`
  },
  description: "Validation pipeline for operator review, run management, and verdict analytics.",
  applicationName: "Validation Ops",
  icons: {
    icon: "/validation-icon.svg",
    shortcut: "/validation-icon.svg",
    apple: "/validation-icon.svg"
  },
  openGraph: {
    siteName: "Validation Ops",
    type: "website"
  },
  twitter: {
    card: "summary_large_image"
  }
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
