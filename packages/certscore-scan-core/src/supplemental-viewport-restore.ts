import type { BrowserContextOptions, CDPSession, Page } from "playwright";

/** Repair browser-side screenshot emulation, not Playwright's cached viewport.
 * Always reapply after supplemental capture: its effect can arrive after an
 * apparently unchanged diagnostic read. No extra screenshot or consent action.
 * Callers retain their own final read; command completion is not restoration proof. */
export async function restoreSupplementalViewport(
  page: Page,
  contextOptions: Pick<BrowserContextOptions, "deviceScaleFactor" | "isMobile" | "screen">,
  timeoutMs = 250,
): Promise<{ attempted: boolean; completed: boolean }> {
  const viewport = page.viewportSize();
  if (!viewport || ![viewport.width, viewport.height].every(value => Number.isInteger(value) && value > 0) ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0) return { attempted: false, completed: false };
  const configured = { ...viewport };
  const screen = contextOptions.screen ?? configured;
  const deadline = Date.now() + timeoutMs;
  let active = true;
  let attempted = false;
  let client: CDPSession | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const acquired = await page.context().newCDPSession(page);
        if (!active || Date.now() >= deadline) {
          void acquired.detach().catch(() => undefined);
          return { attempted: false, completed: false };
        }
        client = acquired;
        attempted = true;
        await acquired.send("Emulation.setDeviceMetricsOverride", {
          width: configured.width,
          height: configured.height,
          screenWidth: screen.width,
          screenHeight: screen.height,
          deviceScaleFactor: contextOptions.deviceScaleFactor ?? 1,
          mobile: contextOptions.isMobile ?? false,
          screenOrientation: contextOptions.isMobile && screen.height >= screen.width
            ? { angle: 0, type: "portraitPrimary" }
            : { angle: contextOptions.isMobile ? 90 : 0, type: "landscapePrimary" },
        });
        return { attempted: true, completed: active && Date.now() < deadline };
      })(),
      new Promise<{ attempted: boolean; completed: boolean }>(resolve => {
        timer = setTimeout(() => { active = false; resolve({ attempted, completed: false }); }, timeoutMs);
      }),
    ]);
  } catch {
    return { attempted, completed: false };
  } finally {
    active = false;
    if (timer) clearTimeout(timer);
    // Cleanup never adds a second wait or schedules another viewport mutation.
    if (client) void client.detach().catch(() => undefined);
  }
}
