"use client";

import { useActionState } from "react";
import { Button } from "@website-signal-risk-scanner/ui";
import {
  initialResendVerificationActionState,
  resendVerificationEmailAction
} from "../../server/password-auth/resend-verification";

type EmailVerificationCardProps = {
  email: string;
  verifiedAt: string | null;
};

export function EmailVerificationCard({ email, verifiedAt }: EmailVerificationCardProps) {
  const [state, action, isPending] = useActionState(resendVerificationEmailAction, initialResendVerificationActionState);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2 text-sm text-slate-600">
        <p className="font-medium text-slate-900">{email}</p>
        {verifiedAt ? (
          <p>
            Verified on{" "}
            {new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeStyle: "short"
            }).format(new Date(verifiedAt))}
            .
          </p>
        ) : (
          <p>Email verification is optional, but recommended for recovery and future security checks.</p>
        )}
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}

      {!verifiedAt ? (
        <Button disabled={isPending} type="submit" variant="secondary">
          {isPending ? "Sending..." : "Resend verification email"}
        </Button>
      ) : null}
    </form>
  );
}
