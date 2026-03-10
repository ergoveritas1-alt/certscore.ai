import type { ReactNode } from "react";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";

type InsightsLayoutProps = {
  children: ReactNode;
};

export default function InsightsLayout({ children }: InsightsLayoutProps) {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      {children}
      <SiteFooter />
    </main>
  );
}
