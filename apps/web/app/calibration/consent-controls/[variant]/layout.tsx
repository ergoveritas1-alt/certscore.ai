import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CONSENT_CONTROL_CANARY_VARIANTS } from "../content";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export function generateStaticParams() {
  return CONSENT_CONTROL_CANARY_VARIANTS.map((variant) => ({ variant }));
}

export default function ConsentControlCanaryLayout({ children }: { children: ReactNode }) {
  return children;
}
