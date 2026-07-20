import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GDPR_TRANSPARENCY_CANARY_LOCALES } from "../content";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export function generateStaticParams() {
  return GDPR_TRANSPARENCY_CANARY_LOCALES.map((locale) => ({ locale }));
}

export default function GdprTransparencyCanaryLayout({ children }: { children: ReactNode }) {
  return children;
}
