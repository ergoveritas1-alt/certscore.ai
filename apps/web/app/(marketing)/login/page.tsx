import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@website-signal-risk-scanner/ui";
import { LoginForm } from "../../../components/auth/login-form";
import { SiteHeader } from "../../../components/layout/site-header";
import { isGoogleAuthAllowedForHost, isGoogleAuthEnabled } from "../../../lib/env";
import { getCurrentUser } from "../../../server/auth";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

function getSafeRedirectPath(nextPath: string | undefined) {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/app";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();
  const resolvedSearchParams = await searchParams;

  if (user) {
    redirect(getSafeRedirectPath(resolvedSearchParams?.next));
  }

  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const allowGoogle = isGoogleAuthEnabled() && isGoogleAuthAllowedForHost(requestHost);

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto flex max-w-xl px-6 py-20">
        <Card className="relative w-full overflow-hidden border-slate-200 bg-white shadow-none">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]" />
          <CardContent className="p-6 pb-0">
            <LoginForm
              allowCreateAccount
              allowGoogle={allowGoogle}
              footerMode="default"
            />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
