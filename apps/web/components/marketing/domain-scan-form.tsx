"use client";

import { createDomainRequestSchema } from "@website-signal-risk-scanner/shared";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type DomainScanFormProps = {
  buttonLabel?: string;
  compact?: boolean;
  helperText?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  mode?: "full" | "preview";
};

export function DomainScanForm({
  buttonLabel = "Start full scan",
  compact = false,
  helperText,
  inputLabel = "Website domain",
  inputPlaceholder = "Enter yoursite.com",
  mode = "preview"
}: DomainScanFormProps) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const parsed = createDomainRequestSchema.safeParse({
      domain
    });

    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message ?? "Enter a valid website domain.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(mode === "preview" ? "/api/preview-scan" : "/api/full-scan", {
        body: JSON.stringify({
          domain
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      const payload = (await response.json()) as { error?: string; previewUrl?: string; scanUrl?: string };
      const destination = mode === "preview" ? payload.previewUrl : payload.scanUrl;

      if (!response.ok || !destination) {
        setErrorMessage(payload.error ?? (mode === "preview" ? "The preview scan could not be started. Please try again." : "The full scan could not be started. Please try again."));
        setIsSubmitting(false);
        return;
      }

      router.push(destination);
    } catch {
      setErrorMessage(mode === "preview" ? "The preview scan could not be started. Please try again." : "The full scan could not be started. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form className={compact ? "space-y-2" : "space-y-4"} onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2">
        <div className="relative">
          <Input
            autoComplete="url"
            className={compact ? "h-12 rounded-[1.2rem] pr-28 text-sm" : "h-14 rounded-[1.6rem] pr-20 text-base"}
            id="domain"
            name="domain"
            onChange={(event) => setDomain(event.target.value)}
            placeholder={inputPlaceholder}
            type="text"
            value={domain}
            aria-label={inputLabel}
          />
          <Button
            aria-label={buttonLabel}
            className={
              compact
                ? "absolute right-2 top-1/2 h-8 -translate-y-1/2 rounded-full border-0 bg-slate-950 px-4 text-xs font-semibold text-white shadow-none hover:bg-slate-800"
                : "absolute right-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full border-0 bg-[linear-gradient(135deg,#47b54a_0%,#5ec158_58%,#7ccf79_100%)] px-0 text-white shadow-[0_10px_24px_rgba(71,181,74,0.16)] hover:brightness-[1.04]"
            }
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? (
              <span className="text-xs">...</span>
            ) : (
              compact ? (
                <span>Scan</span>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )
            )}
          </Button>
        </div>
      </div>
      {helperText && !compact ? (
        <div className="flex justify-start sm:justify-end">
          <p className="max-w-sm text-xs text-slate-500 sm:text-right">{helperText}</p>
        </div>
      ) : null}
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </form>
  );
}
