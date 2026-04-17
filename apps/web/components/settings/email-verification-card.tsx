"use client";

import { useActionState } from "react";
import { Button } from "@website-signal-risk-scanner/ui";
import {
  initialResendVerificationActionState,
  resendVerificationEmailAction
} from "../../server/auth-flows/resend-verification";

type EmailVerificationCardProps = {
  email: string;
  isVerified?: boolean;
  verifiedAt: string | null;
};

export function EmailVerificationCard({ email, isVerified, verifiedAt }: EmailVerificationCardProps) {
  const [state, action, isPending] = useActionState(resendVerificationEmailAction, initialResendVerificationActionState);
  const resolvedIsVerified = isVerified ?? Boolean(verifiedAt);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2 text-sm text-slate-600">
        <p className="font-medium text-slate-900">{email}</p>
        {verifiedAt ? (
          <p>
            Verified on{" "}
            {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
              timeZoneName: "short"
            }).format(new Date(verifiedAt))}
            .
          </p>
        ) : resolvedIsVerified ? (
          <p>Email verified.</p>
        ) : (
          <p>Email verification is optional, but recommended for recovery and future security checks.</p>
        )}
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}

      {!resolvedIsVerified ? (
        <Button disabled={isPending} type="submit" variant="secondary">
          {isPending ? "Sending..." : "Resend verification email"}
        </Button>
      ) : null}
    </form>
  );
}
