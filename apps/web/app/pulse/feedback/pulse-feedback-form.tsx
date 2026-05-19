"use client";

import { useState } from "react";

const RATINGS = ["useful", "not_useful", "unclear", "incorrect", "too_limited"] as const;
const REASONS = [
  "incorrect_finding",
  "missing_evidence",
  "too_much_detail",
  "not_enough_detail",
  "coverage_limited",
  "hard_to_understand",
  "api_issue",
  "other"
] as const;

export function PulseFeedbackForm({
  initialRating,
  pulseRequestId
}: {
  initialRating?: string;
  pulseRequestId: string;
}) {
  const [rating, setRating] = useState(initialRating && RATINGS.includes(initialRating as any) ? initialRating : "useful");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    const response = await fetch("/api/v1/pulse/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pulseRequestId,
        rating,
        reason: reason || null,
        comment: comment || null,
        email: email || null
      })
    });
    setStatus(response.ok ? "sent" : "error");
  }

  return (
    <form className="rounded-lg border border-slate-200 p-4" onSubmit={submit}>
      <h2 className="text-lg font-semibold text-slate-950">Was this Pulse useful?</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {RATINGS.map((item) => (
          <button
            className={`rounded-full border px-3 py-2 text-sm font-semibold ${
              rating === item ? "border-sky-500 bg-sky-50 text-sky-800" : "border-slate-300 text-slate-700"
            }`}
            key={item}
            onClick={() => setRating(item)}
            type="button"
          >
            {item.replaceAll("_", " ")}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Reason
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        >
          <option value="">Optional</option>
          {REASONS.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Comment
        <textarea
          className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          maxLength={2000}
          onChange={(event) => setComment(event.target.value)}
          value={comment}
        />
      </label>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Email
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="optional"
          type="email"
          value={email}
        />
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white" type="submit">
          Send feedback
        </button>
        <a className="text-sm font-semibold text-sky-700" href="mailto:support@certscore.ai">
          support@certscore.ai
        </a>
      </div>
      {status === "sent" ? <p className="mt-3 text-sm text-emerald-700">Feedback received. Thank you.</p> : null}
      {status === "error" ? <p className="mt-3 text-sm text-red-700">Feedback could not be sent right now.</p> : null}
    </form>
  );
}
