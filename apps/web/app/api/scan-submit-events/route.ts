import { NextResponse } from "next/server";

const MAX_STRING_LENGTH = 320;

function sanitizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed.slice(0, MAX_STRING_LENGTH) : null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const event = {
      code: sanitizeText(payload.code),
      destination: sanitizeText(payload.destination),
      domain: sanitizeText(payload.domain),
      error: sanitizeText(payload.error),
      mode: sanitizeText(payload.mode),
      status: typeof payload.status === "number" ? payload.status : null,
      stage: sanitizeText(payload.stage)
    };

    console.warn("[scan-submit] client-side scan submit issue", event);

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.warn("[scan-submit] failed to record client-side scan submit issue", {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json({ ok: true });
  }
}
