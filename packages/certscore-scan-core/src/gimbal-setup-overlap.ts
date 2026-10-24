import type { BrowserContext, Page } from "playwright";
import { SALE_SHARING_EXACT_ROUTE_POLICY, saleSharingExactRouteMatches, type SaleSharingOptOutDispatch } from "@certscore/contracts";

/** Setup scheduling only. This grants no navigation or action authority. The
 * observer parses the dispatch first and still verifies the full live route. */
export function usesGimbalSetupOverlap(config: SaleSharingOptOutDispatch): boolean {
  return config.policyVersion === SALE_SHARING_EXACT_ROUTE_POLICY &&
    config.exactTargetUrl === "https://gimbal.com/" &&
    saleSharingExactRouteMatches(config.exactTargetUrl, config.exactRouteAuthorization);
}

/** Overlap only initial blank-page creation with the two ordered installers.
 * The caller installs the remaining navigation/CDP guards after this barrier.
 * Cancellation uses the observer's existing deadline/signal, never a new timer. */
export async function createGimbalPageWithGuards(input: {
  context: BrowserContext;
  signal: AbortSignal;
  remaining: () => number;
  installIdentityGuard: () => Promise<unknown>;
  installNetworkGuard: () => Promise<unknown>;
}): Promise<Page> {
  let stopped = false;
  const check = () => {
    if (stopped || input.signal.aborted) throw new Error("observation_budget_or_cancellation");
    input.remaining();
  };
  const stop = () => {
    stopped = true;
    // Do not wait beyond the existing deadline for a pending setup branch.
    // Observer finalization retains its existing bounded cleanup reserve.
    void input.context.close().catch(() => undefined);
  };
  let rejectAbort!: (error: Error) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    stop();
    rejectAbort(new Error("observation_budget_or_cancellation"));
  };
  input.signal.addEventListener("abort", onAbort, { once: true });
  // Both branches are observed by Promise.all, including late rejections after
  // a failure/abort. No late branch can continue to navigation.
  const pageWork = Promise.resolve().then(async () => {
    check();
    const page = await input.context.newPage();
    try {
      check();
      if (page.url() !== "about:blank") throw new Error("gimbal_setup_not_blank");
      return page;
    } catch (error) {
      // Context closure may precede a delayed page resolution.
      void page.close().catch(() => undefined);
      throw error;
    }
  });
  const guardWork = Promise.resolve().then(async () => {
    check();
    await input.installIdentityGuard();
    check();
    await input.installNetworkGuard();
    check();
  });
  try {
    const work = Promise.all([pageWork, guardWork]);
    if (input.signal.aborted) onAbort();
    const [page] = await Promise.race([work, aborted]);
    check();
    if (page.url() !== "about:blank") throw new Error("gimbal_setup_not_blank");
    return page;
  } catch (error) {
    stop();
    throw error;
  } finally {
    input.signal.removeEventListener("abort", onAbort);
  }
}
