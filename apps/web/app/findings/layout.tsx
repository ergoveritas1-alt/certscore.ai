import type { ReactNode } from "react";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";

type FindingsLayoutProps = {
  children: ReactNode;
};

export default function FindingsLayout({ children }: FindingsLayoutProps) {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      {children}
      <SiteFooter />
    </main>
  );
}
