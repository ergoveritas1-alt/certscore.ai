import { NextResponse } from "next/server";
import { z } from "zod";
import { PULSE_FEEDBACK_RATINGS, PULSE_FEEDBACK_REASONS, PULSE_FEEDBACK_EMAIL } from "../../../../../lib/pulse/constants";
import { buildPulseError } from "../../../../../lib/pulse/error";
import { getPulseRequesterContext } from "../../../../../lib/pulse/request";
import { getPulseFeedbackCount, savePulseFeedback } from "../../../../../server/pulse/repository";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  pulseRequestId: z.string().trim().min(1).max(120),
  rating: z.enum(PULSE_FEEDBACK_RATINGS),
  reason: z.enum(PULSE_FEEDBACK_REASONS).nullable().optional(),
  comment: z.string().trim().max(2000).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional()
});

function sanitizeComment(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  return value.replace(/[<>]/g, "").slice(0, 2000);
}

export async function POST(request: Request) {
  const requester = getPulseRequesterContext(request);
  const payload = await request.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      buildPulseError({ code: "invalid_url", message: parsed.error.issues[0]?.message ?? "Invalid feedback payload." }),
      { status: 400 }
    );
  }
  const recentCount = await getPulseFeedbackCount({
    pulseRequestId: parsed.data.pulseRequestId,
    ipHash: requester.ipHash
  });
  if (recentCount >= 5) {
    return NextResponse.json(
      buildPulseError({
        code: "rate_limited",
        message: "Feedback was submitted recently. Try again later.",
        retryAfterSeconds: 3600
      }),
      { headers: { "Retry-After": "3600" }, status: 429 }
    );
  }
  const saved = await savePulseFeedback({
    pulseRequestId: parsed.data.pulseRequestId,
    rating: parsed.data.rating,
    reason: parsed.data.reason ?? null,
    comment: sanitizeComment(parsed.data.comment),
    email: parsed.data.email ?? null,
    ipHash: requester.ipHash,
    userAgent: requester.userAgent
  });
  if (!saved) {
    return NextResponse.json(buildPulseError({ code: "not_found", message: "Pulse request not found." }), { status: 404 });
  }
  return NextResponse.json(
    {
      type: "certscore_pulse_feedback",
      ok: true,
      feedback: {
        email: PULSE_FEEDBACK_EMAIL
      }
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
