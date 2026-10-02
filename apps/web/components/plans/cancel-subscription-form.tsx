"use client";

import { Button } from "@website-signal-risk-scanner/ui";
import { useFormStatus } from "react-dom";

type CancelSubscriptionFormProps = {
  action: (formData: FormData) => Promise<void>;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button data-analytics-feature="billing_cancellation" data-analytics-id="billing:cancel" disabled={pending} size="sm" type="submit" variant="secondary">
      {pending ? "Opening cancellation..." : "Cancel subscription"}
    </Button>
  );
}

export function CancelSubscriptionForm({ action }: CancelSubscriptionFormProps) {
  return (
    <form action={action} data-analytics-form="billing_cancel">
      <input name="intent" type="hidden" value="cancel_subscription" />
      <SubmitButton />
    </form>
  );
}
