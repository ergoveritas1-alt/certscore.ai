/** Passive operations must settle at the existing absolute action boundary.
 * Timing out does not cancel a browser RPC: discard its late value, absorb its
 * rejection and optionally dispose a resource acquired after cancellation.
 * This helper never retries or renews the deadline. */
export async function readWithinActionBoundary<T>(
  read: () => Promise<T>, unavailable: T, deadlineAtMs: number, signal?: AbortSignal,
  disposeLate?: (value: T) => void | Promise<unknown>,
): Promise<T> {
  const stopped = () => signal?.aborted || Date.now() >= deadlineAtMs;
  if (stopped()) return unavailable;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | undefined;
  let abandoned = false;
  try {
    const operation = Promise.resolve().then(() => stopped() ? unavailable : read()).then(value => {
      if (abandoned || stopped()) {
        if (value !== unavailable) void Promise.resolve().then(() => disposeLate?.(value)).catch(() => undefined);
        return unavailable;
      }
      return value;
    });
    return await Promise.race([operation, new Promise<T>(resolve => {
      stop = () => { abandoned = true; resolve(unavailable); };
      if (Number.isFinite(deadlineAtMs)) timer = setTimeout(stop, Math.max(0, deadlineAtMs - Date.now()));
      signal?.addEventListener('abort', stop, {once:true});
      if (stopped()) stop();
    })]);
  } finally {
    if (timer) clearTimeout(timer);
    if (stop) signal?.removeEventListener('abort',stop);
  }
}

export class ActionOperationStopped extends Error {
  constructor() { super('Action browser operation exceeded its existing boundary.'); }
}

/** Required reads/resources cannot continue an action with invented defaults. */
export async function requireWithinActionBoundary<T>(read:()=>Promise<T>, deadlineAtMs:number,
  signal?:AbortSignal, disposeLate?:(value:T)=>void|Promise<unknown>):Promise<T> {
  const unavailable=Symbol('unavailable');
  const value=await readWithinActionBoundary<T|typeof unavailable>(read,unavailable,deadlineAtMs,signal,
    value => value===unavailable ? undefined : disposeLate?.(value));
  if(value===unavailable)throw new ActionOperationStopped();
  return value;
}
