import { Suspense } from "react";
import { Card, CardContent } from "@website-signal-risk-scanner/ui";
import { ResetPasswordUpdateForm } from "../../../../components/auth/reset-password-update-form";
import { SiteHeader } from "../../../../components/layout/site-header";

export default function ResetPasswordUpdatePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto flex max-w-xl px-6 py-20">
        <Card className="relative w-full overflow-hidden border-slate-200 bg-white shadow-none">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]" />
          <CardContent className="p-6">
            <Suspense fallback={null}>
              <ResetPasswordUpdateForm />
            </Suspense>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
