import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { LoginForm } from "../auth/login-form";
import { getCurrentUser } from "../../server/auth";
import { isValidationAllowedEmail, VALIDATION_ALLOWED_EMAIL } from "../../server/validation/auth";

export async function ValidationPublicHome() {
  const user = await getCurrentUser();

  if (user && isValidationAllowedEmail(user.email)) {
    redirect("/app");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.2),_transparent_30%),linear-gradient(180deg,#ecfeff_0%,#f8fafc_48%,#e2e8f0_100%)] px-6 py-16 text-slate-900">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">Validation Ops</p>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-slate-950">Sign in to the validation pipeline</h1>
          <p className="text-sm text-slate-600">
            Contact{" "}
            <a className="font-medium text-teal-700 transition hover:text-teal-800" href="mailto:xlprep@gmail.com">
              xlprep@gmail.com
            </a>
          </p>
        </div>

        <Card className="border-slate-200 bg-white/90 shadow-none">
          <CardContent className="p-6">
            <LoginForm
              allowedEmail={VALIDATION_ALLOWED_EMAIL}
              allowCreateAccount={false}
              allowGoogle={false}
              footerMode="hidden"
              title="Validation Ops access"
            />
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto mt-10 max-w-6xl">
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-slate-200 bg-white/85">
            <CardHeader>
              <CardTitle>Purpose</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Benchmark scanner precision by comparing automated findings with structured LLM review.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white/85">
            <CardHeader>
              <CardTitle>Cadence</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Manual by default. Automatic mode samples targets on a controlled cadence between 5 and 240 minutes.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white/85">
            <CardHeader>
              <CardTitle>Scope</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Validation currently focuses on privacy and legal rule families, not accessibility verdicting.
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
