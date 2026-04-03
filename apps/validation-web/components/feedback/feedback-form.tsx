"use client";

import { useActionState } from "react";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { sendFeedbackAction, type SendFeedbackActionState } from "../../server/feedback/send-feedback";

type FeedbackFormProps = {
  userEmail: string;
};

export function FeedbackForm({ userEmail }: FeedbackFormProps) {
  const initialState: SendFeedbackActionState = {
    error: null
  };
  const [state, action, isPending] = useActionState(sendFeedbackAction, initialState);

  return (
    <form action={action} className="space-y-5">
      <input name="userEmail" type="hidden" value={userEmail} />

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="feedbackSubject">
          Subject
        </label>
        <Input
          id="feedbackSubject"
          name="subject"
          placeholder="What are you running into?"
          type="text"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="feedbackBody">
          Feedback
        </label>
        <textarea
          id="feedbackBody"
          name="feedback"
          placeholder="Share what is confusing, broken, missing, or worth improving."
          rows={8}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
        />
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <Button disabled={isPending} type="submit">
        {isPending ? "Sending..." : "Send feedback"}
      </Button>
    </form>
  );
}
