import type { ReactNode } from "react";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";

export default function ReleasesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
