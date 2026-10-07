import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { CDPSession, ElementHandle, Page } from "playwright";

export type FormScreenshotLayout = {
  url: string;
  viewport: { x: number; y: number; width: number; height: number };
  bounds: { x: number; y: number; width: number; height: number };
  rootBounds: { x: number; y: number; width: number; height: number };
  masks: Array<{ x: number; y: number; width: number; height: number }>;
  controlsRedacted: boolean;
};

export type PreparedMaskedFormScreenshot = { token: string; before: FormScreenshotLayout };

export async function cleanupPreparedMaskedFormScreenshot(page: Page, token: string): Promise<void> {
  await page.evaluate(token => {
    const key = `__certscoreFormCapture_${token}`;
    const state = (window as any)[key];
    if (!state) return;
    delete (window as any)[key];
    state.node.remove();
    for (const animation of state.animations) if (animation.playState === "paused") animation.play();
    if (state.markerRoot.getAttribute(state.attribute) === token) {
      if (state.previous === null) state.markerRoot.removeAttribute(state.attribute);
      else state.markerRoot.setAttribute(state.attribute, state.previous);
    }
    for (const entry of state.scrollPositions) entry.element.scrollTo({ left: entry.x, top: entry.y, behavior: "instant" });
    scrollTo({ left: state.position.x, top: state.position.y, behavior: "instant" });
  }, token);
}

async function maskFormPixels(data: string | Buffer, clip: FormScreenshotLayout["bounds"], masks: FormScreenshotLayout["masks"]): Promise<Buffer> {
  const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, "base64");
  const metadata = await sharp(raw, { limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Form screenshot dimensions unavailable");
  const sx = metadata.width / clip.width, sy = metadata.height / clip.height;
  const overlays = masks.flatMap(r => {
    if (r.width <= 0 || r.height <= 0) return [];
    const left = Math.max(0, Math.floor((r.x - clip.x - 4) * sx));
    const top = Math.max(0, Math.floor((r.y - clip.y - 4) * sy));
    const right = Math.min(metadata.width!, Math.ceil((r.x + r.width - clip.x + 4) * sx));
    const bottom = Math.min(metadata.height!, Math.ceil((r.y + r.height - clip.y + 4) * sy));
    if (right <= left || bottom <= top) return [];
    return [{ input: { create: { width: right - left, height: bottom - top, channels: 3 as const, background: "#94a3b8" } }, left, top }];
  });
  return sharp(raw).composite(overlays).jpeg({ quality: 45 }).toBuffer();
}

/** The exact-control binding has already frozen animations and returned the
 * first layout in one browser call. Only matching post-pixel geometry may be
 * reviewed; any timeout or document drift discards the raw screenshot. */
export async function capturePreparedMaskedFormScreenshot(page: Page, prepared: PreparedMaskedFormScreenshot,
  timeoutMs: number, session: CDPSession): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stage = "capture_pixels";
  const startedAtMs = Date.now();
  let capturePixelsMs: number | undefined;
  let verifiedCleaned = false;
  try {
    return await Promise.race([(async () => {
      const clip = prepared.before.bounds;
      if (clip.width <= 0 || clip.height <= 0) throw new Error("Form screenshot bounds unavailable");
      if (clip.width * clip.height > 40_000_000) throw new Error("Form screenshot bounds exceeded");
      const viewport = prepared.before.viewport;
      if (clip.x < viewport.x || clip.y < viewport.y || clip.x + clip.width > viewport.x + viewport.width ||
        clip.y + clip.height > viewport.y + viewport.height) throw new Error("Form screenshot viewport binding unavailable");
      // Clip only the visible form region. The strict post-pixel layout and
      // control-mask check below still binds the pixels to this exact crop.
      const captured = await session.send("Page.captureScreenshot", {
        format: "jpeg", quality: 45, fromSurface: true, optimizeForSpeed: true, captureBeyondViewport: false,
        clip: { ...clip, scale: Math.min(1, 640 / clip.width, 960 / clip.height) },
      });
      capturePixelsMs = Date.now() - startedAtMs;
      stage = "verify_layout";
      const after = await page.evaluate(({ token, crop }) => {
        const key = `__certscoreFormCapture_${token}`;
        const state = (window as any)[key];
        if (!state) throw new Error("Form screenshot binding unavailable");
        try {
          const root: Element = state.root;
          const rect = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
          };
          const controls = document.querySelectorAll('input, textarea, select, [role="checkbox"], [role="switch"], [contenteditable]');
          if (!root.isConnected || controls.length > 1000) throw new Error("Form screenshot binding unavailable");
          const intersecting = Array.from(controls).filter(control => {
            const r = rect(control);
            return r.width > 0 && r.height > 0 &&
            r.x - 2 < crop.x + crop.width && r.y - 2 < crop.y + crop.height &&
            r.x + r.width + 2 > crop.x && r.y + r.height + 2 > crop.y;
          });
          const masks = intersecting.map(rect);
          const controlsRedacted = Boolean(state.hideControlsDuringCapture) &&
            state.node.isConnected && state.markerRoot.getAttribute(state.attribute) === token &&
            intersecting.length > 0 && intersecting.every(control => getComputedStyle(control).clipPath === "inset(100%)");
          const rootBounds = rect(root);
          const viewport = { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight };
          if (crop.x < rootBounds.x || crop.y < rootBounds.y ||
            crop.x + crop.width > rootBounds.x + rootBounds.width ||
            crop.y + crop.height > rootBounds.y + rootBounds.height ||
            crop.x < viewport.x || crop.y < viewport.y ||
            crop.x + crop.width > viewport.x + viewport.width ||
            crop.y + crop.height > viewport.y + viewport.height) {
            throw new Error("Form screenshot crop changed");
          }
          return { url: location.href, viewport, rootBounds,
            bounds: crop, masks, controlsRedacted };
        } finally {
          delete (window as any)[key];
          state.node.remove();
          for (const animation of state.animations) if (animation.playState === "paused") animation.play();
          if (state.markerRoot.getAttribute(state.attribute) === token) {
            if (state.previous === null) state.markerRoot.removeAttribute(state.attribute);
            else state.markerRoot.setAttribute(state.attribute, state.previous);
          }
          for (const entry of state.scrollPositions) entry.element.scrollTo({ left: entry.x, top: entry.y, behavior: "instant" });
          scrollTo({ left: state.position.x, top: state.position.y, behavior: "instant" });
        }
      }, { token: prepared.token, crop: clip });
      verifiedCleaned = true;
      if (Date.now() >= deadline) throw new Error("Form screenshot deadline");
      if (after.rootBounds.x !== prepared.before.rootBounds.x ||
        after.rootBounds.y !== prepared.before.rootBounds.y ||
        after.rootBounds.width !== prepared.before.rootBounds.width) {
        throw new Error("Form screenshot layout changed: rootBounds");
      }
      if (after.controlsRedacted !== prepared.before.controlsRedacted) throw new Error("Form screenshot control redaction changed");
      for (const key of ["url", "viewport", "bounds"] as const) {
        if (JSON.stringify(prepared.before[key]) !== JSON.stringify(after[key])) {
          console.warn("[form-snapshot-layout-drift]", JSON.stringify({ key,
            before: key === "url" ? undefined : prepared.before[key],
            after: key === "url" ? undefined : after[key] }));
          throw new Error(`Form screenshot layout changed: ${key}`);
        }
      }
      if (!prepared.before.controlsRedacted && JSON.stringify(prepared.before.masks) !== JSON.stringify(after.masks)) {
        throw new Error("Form screenshot layout changed: masks");
      }
      stage = "mask_pixels";
      const result = await maskFormPixels(captured.data, clip, [...prepared.before.masks, ...after.masks]);
      if (Date.now() >= deadline) throw new Error("Form screenshot deadline");
      return result;
    })(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Form screenshot deadline")), Math.max(1, deadline - Date.now()));
    })]);
  } catch (error) {
    const clip = prepared.before.bounds;
    const viewport = prepared.before.viewport;
    console.warn("[form-snapshot-capture]", JSON.stringify({ stage,
      code: error instanceof Error && error.message.includes("Form screenshot crop changed") ? "crop_changed" : error instanceof Error && error.message.startsWith("Form screenshot ") ? error.message.slice(0, 100) : "browser_operation_failed",
      deadlineExpired: Date.now() >= deadline,
      elapsedMs: Date.now() - startedAtMs, capturePixelsMs,
      captureBeyondViewport: !(clip.x >= viewport.x && clip.y >= viewport.y &&
        clip.x + clip.width <= viewport.x + viewport.width && clip.y + clip.height <= viewport.y + viewport.height),
      clipWidth: Math.round(clip.width), clipHeight: Math.round(clip.height),
      clipY: Math.round(clip.y), viewportY: Math.round(viewport.y) }));
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    // A timed-out page evaluation must not delay the result barrier. The
    // observer closes this isolated browser session after bounded capture.
    if (!verifiedCleaned) void cleanupPreparedMaskedFormScreenshot(page, prepared.token).catch(() => {});
  }
}

/** Capture current pixels without Playwright's page-wide font/stability wait.
 * Redact every input rectangle before the image can leave this function. A
 * changed document/layout or unbounded control inventory discards the image. */
export async function captureMaskedFormScreenshot(page: Page, element: ElementHandle, timeoutMs: number, boundSession?: CDPSession): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pixelTimer: ReturnType<typeof setTimeout> | undefined;
  const acquisition = boundSession ? Promise.resolve(boundSession) : page.context().newCDPSession(page);
  let acquisitionTimer: ReturnType<typeof setTimeout> | undefined;
  const session = await Promise.race([acquisition, new Promise<never>((_, reject) => {
    acquisitionTimer = setTimeout(() => reject(new Error("Form screenshot session deadline")), Math.max(1, deadline - Date.now()));
  })]).catch(error => {
    if (!boundSession) void acquisition.then(client => client.detach()).catch(() => {});
    throw error;
  }).finally(() => { if (acquisitionTimer) clearTimeout(acquisitionTimer); });
  let stage = "pause_animation";
  let style: Awaited<ReturnType<Page["evaluateHandle"]>> | undefined;
  const cleanupStyle = async () => {
    await style?.evaluate((state: any) => {
      if (!state) return;
      state.node.remove();
      for (const animation of state.animations) {
        if (animation.playState === "paused") animation.play();
      }
      if (state.previous === null) state.markerRoot.removeAttribute(state.attribute);
      else state.markerRoot.setAttribute(state.attribute, state.previous);
      for (const entry of state.scrollPositions) entry.element.scrollTo({ left: entry.x, top: entry.y, behavior: "instant" });
      scrollTo({ left: state.position.x, top: state.position.y, behavior: "instant" });
    }).catch(() => {});
    await style?.dispose().catch(() => {});
  };
  try {
    return await Promise.race([
      (async () => {
        style = await element.evaluateHandle((root, { deadlineAtMs, marker }) => {
          if (Date.now() >= deadlineAtMs || !(root instanceof Element)) return null;
          const position = { x: scrollX, y: scrollY };
          // CSS freezes the whole page so sibling movement cannot shift the
          // form. Inspect only the form subtree and ancestors for script-owned
          // animations; a page-wide getAnimations() can consume the window on
          // animation-heavy sites such as SITS.
          const animationSet = new Set<Animation>();
          for (let current: Element | null = root; current; current = current.parentElement) {
            for (const animation of current.getAnimations({ subtree: current === root })) animationSet.add(animation);
          }
          const animations = Array.from(animationSet);
          if (animations.length > 1000) throw new Error("Form screenshot animation inventory exceeded");
          const runningAnimations = animations.filter(animation => animation.playState === "running");
          for (const animation of runningAnimations) animation.pause();
          const scrollPositions = [];
          for (let parent = root.parentElement; parent; parent = parent.parentElement) {
            scrollPositions.push({ element: parent, x: parent.scrollLeft, y: parent.scrollTop });
          }
          const attribute = "data-certscore-form-capture";
          const markerRoot = document.documentElement;
          const previous = markerRoot.getAttribute(attribute);
          markerRoot.setAttribute(attribute, marker);
          const node = document.createElement("style");
          const scope = `html[${attribute}="${marker}"]`;
          node.textContent = `${scope},${scope} *,${scope}::before,${scope}::after,${scope} *::before,${scope} *::after{animation-play-state:paused!important;transition-property:none!important;caret-color:transparent!important}`;
          document.documentElement.appendChild(node);

          // Check the synchronous pause before returning the handle. A second
          // browser round trip can consume the remaining late-form window on
          // pages busy with post-consent scripts.
          if (runningAnimations.some(animation => animation.playState === "running")) {
            node.remove();
            if (previous === null) markerRoot.removeAttribute(attribute);
            else markerRoot.setAttribute(attribute, previous);
            for (const animation of runningAnimations) {
              if (animation.playState === "paused") animation.play();
            }
            throw new Error("Form screenshot animation did not pause");
          }

          return { node, markerRoot, attribute, previous, position, scrollPositions, animations: runningAnimations };
        }, { deadlineAtMs: deadline, marker: randomUUID() });
        // A page with a throttled or permanently pending animation may never
        // settle every animation.ready promise. The injected paused CSS and
        // synchronous pause state are sufficient to proceed to the strict
        // before/after layout check without waiting for unrelated frames.
        stage = "read_layout";
        if (Date.now() >= deadline) {
          await cleanupStyle();
          throw new Error("Form screenshot deadline");
        }
        const readLayout = (captureBounds?: { x: number; y: number; width: number; height: number }) => element.evaluate((root, captureBounds) => {
          const rect = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
          };
          const controls = document.querySelectorAll('input, textarea, select, [role="checkbox"], [role="switch"], [contenteditable]');
          if (!(root instanceof Element) || !root.isConnected || controls.length > 1000) throw new Error("Form screenshot binding unavailable");
          const bounds = rect(root);
          const crop = captureBounds ?? bounds;
          // Only rectangles that can affect retained pixels participate in binding.
          // Reuse the original crop after capture so newly entering controls fail closed.
          const masks = Array.from(controls, rect).filter(r => r.width > 0 && r.height > 0
            && r.x - 2 < crop.x + crop.width && r.y - 2 < crop.y + crop.height
            && r.x + r.width + 2 > crop.x && r.y + r.height + 2 > crop.y);
          return { url: location.href, viewport: { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight }, bounds, masks };
        }, captureBounds);
        stage = "read_layout";
        const before = await readLayout();
        if (Date.now() >= deadline) throw new Error("Form screenshot deadline");
        const clip = before.bounds;
        if (clip.width <= 0 || clip.height <= 0) throw new Error("Form screenshot bounds unavailable");
        if (clip.width * clip.height > 40_000_000) throw new Error("Form screenshot bounds exceeded");
        stage = "capture_pixels";
        const captured = await Promise.race([session.send("Page.captureScreenshot", {
          format: "jpeg", quality: 45, fromSurface: true, optimizeForSpeed: true,
          captureBeyondViewport: !(clip.x >= before.viewport.x && clip.y >= before.viewport.y && clip.x + clip.width <= before.viewport.x + before.viewport.width && clip.y + clip.height <= before.viewport.y + before.viewport.height),
          clip: { ...clip, scale: Math.min(1, 640 / clip.width, 960 / clip.height) },
        }), new Promise<never>((_, reject) => {
          pixelTimer = setTimeout(() => reject(new Error("Form screenshot pixel deadline")), Math.min(2000, Math.max(1, deadline - Date.now())));
        })]).finally(() => { if (pixelTimer) clearTimeout(pixelTimer); });
        stage = "verify_layout";
        const after = await readLayout(clip);
        if (Date.now() >= deadline) throw new Error("Form screenshot deadline");
        for (const key of ["url", "viewport", "bounds", "masks"] as const) {
          if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) throw new Error(`Form screenshot layout changed: ${key}`);
        }
        stage = "mask_pixels";
        const result = await maskFormPixels(captured.data, clip, before.masks);
        if (Date.now() >= deadline) throw new Error("Form screenshot deadline");
        return result;
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Form screenshot deadline")), Math.max(1, deadline - Date.now())); }),
    ]);
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith("Form screenshot ")
      ? error.message.slice(0, 100) : "browser_operation_failed";
    console.warn("[form-snapshot-capture]", JSON.stringify({ stage, code, deadlineExpired: Date.now() >= deadline }));
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (pixelTimer) clearTimeout(pixelTimer);
    // The caller owns a bound session and detaches it after the final loader
    // check. A newly acquired session remains local to this screenshot.
    if (!boundSession) await session.detach().catch(() => {});
    await cleanupStyle();
  }
}
