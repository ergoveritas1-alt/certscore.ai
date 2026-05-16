"use client";

import { useActionState } from "react";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { pushLeadFormSubmitAttempted } from "../analytics/data-layer-events";
import { sendContactSalesAction, type SendContactSalesActionState } from "../../server/contact-sales/send-contact-sales";

export function ContactSalesForm() {
  const initialState: SendContactSalesActionState = {
    error: null
  };
  const [state, action, isPending] = useActionState(sendContactSalesAction, initialState);

  return (
    <form action={action} className="space-y-5" onSubmit={() => pushLeadFormSubmitAttempted("contact_sales")}>
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
            Work email
          </label>
          <Input id="contactSalesWorkEmail" name="workEmail" placeholder="name@company.com" type="email" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="contactSalesCompany">
            Company <span className="text-slate-400">(optional)</span>
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
          What would you like to discuss? <span className="text-slate-400">(optional)</span>
        </label>
        <textarea
          id="contactSalesMessage"
          name="message"
          placeholder="Add context about your team, monitoring needs, procurement questions, or anything else you want us to know."
          rows={6}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
        />
        <p className="text-xs text-slate-500">Work email plus website is enough for a follow-up.</p>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <Button disabled={isPending} type="submit">
        {isPending ? "Sending..." : "Send request"}
      </Button>
    </form>
  );
}
