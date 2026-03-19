import type { ReactNode } from "react";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";

type GuidesLayoutProps = {
  children: ReactNode;
};

export default function GuidesLayout({ children }: GuidesLayoutProps) {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      {children}
      <SiteFooter />
    </main>
  );
}
