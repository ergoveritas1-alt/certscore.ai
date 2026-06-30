import type { ReactNode } from "react";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";

type SolutionsLayoutProps = {
  children: ReactNode;
};

export default function SolutionsLayout({ children }: SolutionsLayoutProps) {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      {children}
      <SiteFooter />
    </main>
  );
}
