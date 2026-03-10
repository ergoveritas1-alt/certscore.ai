"use client";

import { useActionState } from "react";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { sendContactSalesAction, type SendContactSalesActionState } from "../../server/contact-sales/send-contact-sales";

export function ContactSalesForm() {
  const initialState: SendContactSalesActionState = {
    error: null
  };
  const [state, action, isPending] = useActionState(sendContactSalesAction, initialState);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="contactSalesFullName">
            Full name
          </label>
          <Input id="contactSalesFullName" name="fullName" placeholder="Your name" type="text" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="contactSalesWorkEmail">
            Work email
          </label>
          <Input id="contactSalesWorkEmail" name="workEmail" placeholder="name@company.com" type="email" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="contactSalesCompany">
            Company
          </label>
          <Input id="contactSalesCompany" name="company" placeholder="Company name" type="text" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="contactSalesWebsite">
            Website
          </label>
          <Input id="contactSalesWebsite" name="website" placeholder="example.com" type="text" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="contactSalesMessage">
          What would you like to discuss?
        </label>
        <textarea
          id="contactSalesMessage"
          name="message"
          placeholder="Tell us about your team, number of websites, monitoring needs, or any questions about plans and onboarding."
          rows={8}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
        />
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <Button disabled={isPending} type="submit">
        {isPending ? "Sending..." : "Contact sales"}
      </Button>
    </form>
  );
}
