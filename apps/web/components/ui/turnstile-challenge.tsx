"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    cData: string;
    size: "compact";
    appearance: "interaction-only";
    "response-field": false;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }): string;
  remove(widgetId: string): void;
};

export function TurnstileChallenge({ siteKey, action, requestId, token, onToken }: {
  siteKey: string;
  action: string;
  requestId: string;
  token: string;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready || !container.current) return;
    const turnstile = (window as Window & { turnstile?: Turnstile }).turnstile;
    if (!turnstile) {
      setFailed(true);
      return;
    }
    const widget = turnstile.render(container.current, {
      sitekey: siteKey,
      action,
      cData: requestId,
      size: "compact",
      appearance: "interaction-only",
      "response-field": false,
      callback: (value) => {
        setFailed(false);
        onToken(value);
      },
      "expired-callback": () => onToken(""),
      "error-callback": () => {
        onToken("");
        setFailed(true);
      }
    });
    return () => turnstile.remove(widget);
  }, [ready, siteKey, action, requestId, onToken]);

  return (
    <div>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      <div ref={container} />
      <p role="status" className="text-sm text-slate-600">
        {failed
          ? "The security check couldn’t load. Reload this page to try again."
          : token ? "Security check complete." : "Complete the security check if prompted."}
      </p>
    </div>
  );
}
