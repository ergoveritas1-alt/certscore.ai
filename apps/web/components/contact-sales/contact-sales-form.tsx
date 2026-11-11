"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { pushLeadFormSubmitAttempted } from "../analytics/data-layer-events";
import { sendContactSalesAction, type SendContactSalesActionState } from "../../server/contact-sales/send-contact-sales";
import { CONTACT_CAPTCHA_ACTION } from "../../lib/turnstile";
import { TurnstileChallenge } from "../ui/turnstile-challenge";

export function ContactSalesForm({ captchaSiteKey }: { captchaSiteKey?: string }) {
  const initialState: SendContactSalesActionState = {
    error: null
  };
  const [state, action, isPending] = useActionState(sendContactSalesAction, initialState);
  const [captchaToken, setCaptchaToken] = useState("");
  const [requestId, setRequestId] = useState(() => captchaSiteKey ? crypto.randomUUID() : "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!captchaSiteKey) {
      pushLeadFormSubmitAttempted("contact_sales");
      return;
    }
    event.preventDefault();
    if (!captchaToken || isPending) return;

    const data = new FormData(event.currentTarget);
    data.set("captchaToken", captchaToken);
    data.set("captchaRequestId", requestId);
    setCaptchaToken("");
    setRequestId(crypto.randomUUID());
    pushLeadFormSubmitAttempted("contact_sales");
    // Dispatch directly so a failed challenge preserves the visitor's message.
    startTransition(() => action(data));
  }

  return (
    <form action={action} className="space-y-5" onSubmit={handleSubmit}>
      <input name="requestType" type="hidden" value="sales-contact" />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="contactSalesFullName">
            Full name <span className="text-slate-400">(optional)</span>
          </label>
          <Input id="contactSalesFullName" name="fullName" placeholder="Your name" type="text" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="contactSalesWorkEmail">
            Email address
          </label>
          <Input id="contactSalesWorkEmail" name="workEmail" placeholder="name@company.com" type="email" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="contactSalesCompany">
            Company <span className="text-slate-400">(optional)</span>
          </label>
          <Input id="contactSalesCompany" name="company" placeholder="Company name" type="text" />
        </div>

      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="contactSalesMessage">
          Message
        </label>
        <textarea
          id="contactSalesMessage"
          name="message"
          placeholder="How can we help?"
          required
          rows={6}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
        />
        <p className="text-xs text-slate-500">Your message will be sent to support@certscore.ai.</p>
      </div>

      {captchaSiteKey && (
        <TurnstileChallenge
          key={requestId}
          siteKey={captchaSiteKey}
          action={CONTACT_CAPTCHA_ACTION}
          requestId={requestId}
          token={captchaToken}
          onToken={setCaptchaToken}
        />
      )}

      {state.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}

      <Button disabled={isPending || Boolean(captchaSiteKey && !captchaToken)} type="submit">
        {isPending ? "Sending..." : "Send request"}
      </Button>
    </form>
  );
}
