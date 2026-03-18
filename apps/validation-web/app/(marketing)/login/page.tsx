import { redirect } from "next/navigation";
import { Card, CardContent } from "@website-signal-risk-scanner/ui";
import { LoginForm } from "../../../components/auth/login-form";
import { getCurrentUser } from "../../../server/auth";
import { isValidationAllowedEmail, VALIDATION_ALLOWED_EMAIL } from "../../../server/validation/auth";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user && isValidationAllowedEmail(user.email)) {
    redirect("/app");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto flex max-w-xl px-6 py-20">
        <Card className="relative w-full overflow-hidden border-slate-200 bg-white shadow-none">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]" />
          <CardContent className="p-6 pb-0">
            <LoginForm
              allowedEmail={VALIDATION_ALLOWED_EMAIL}
              allowCreateAccount={false}
              allowGoogle={false}
              footerMode="hidden"
              title="Sign in to Validation Ops"
            />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
