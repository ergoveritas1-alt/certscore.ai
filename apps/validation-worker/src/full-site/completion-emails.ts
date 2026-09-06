import {
  fullSiteInternalEnabled,
  reserveFullSiteCompletionEmail,
} from "@website-signal-risk-scanner/db";

export function startFullSiteCompletionEmails() {
  let running = false;
  async function tick() {
    if (running || !fullSiteInternalEnabled()) return;
    running = true;
    try {
      const origin =
        process.env.CERTSCORE_FULL_SITE_CONTROL_ORIGIN ??
        "https://certscore.ai";
      if (new URL(origin).protocol !== "https:")
        throw new Error("Completion email control plane requires HTTPS.");
      const job = await reserveFullSiteCompletionEmail();
      if (!job) return;
      const response = await fetch(
        new URL("/api/internal/full-site/completion-email", origin),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(job),
          redirect: "error",
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) throw new Error("Completion email dispatch failed.");
    } catch {
      console.error(
        "[scan-completion-email] delivery dispatch failed; persisted state controls recovery",
      );
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => void tick(), 15000);
  timer.unref();
  void tick();
}
