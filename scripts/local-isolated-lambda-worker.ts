import { fork } from 'node:child_process';

/** Local Lambda simulation must not let CPU-only policy work stop another
 * lane's browser timers. Each real Lambda already has its own event loop. */
export function runLocalIsolatedLambdaWorker(input: {
  entrypoint: string; workspaceRoot: string; payload: object; signal?: AbortSignal;
  onMessage: (body: string) => Promise<unknown>;
}): Promise<unknown> {
  input.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = fork(input.entrypoint, [], {cwd: input.workspaceRoot,
      execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {...process.env, TSX_TSCONFIG_PATH: 'tsconfig.base.json'}});
    child.stdout?.pipe(process.stdout, {end: false});
    child.stderr?.pipe(process.stderr, {end: false});
    let settled = false;
    let resultReceived = false;
    let delivery = Promise.resolve<unknown>(undefined);
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      input.signal?.removeEventListener('abort', aborted);
      if (error) { child.kill('SIGTERM'); reject(error); } else resolve(result);
    };
    const aborted = () => finish(new Error('Local policy worker invocation aborted.'));
    input.signal?.addEventListener('abort', aborted, {once: true});
    if (input.signal?.aborted) { aborted(); return; }
    child.on('message', (message: unknown) => {
      if (!message || typeof message !== 'object' || settled) return;
      const row = message as {type?: string; body?: string; result?: unknown; error?: string};
      if (row.type === 'sqs' && typeof row.body === 'string') {
        delivery = delivery.then(() => input.onMessage(row.body!));
        void delivery.catch(error => finish(error instanceof Error ? error : new Error(String(error))));
      } else if (row.type === 'result') {
        resultReceived = true;
        void delivery.then(() => finish(undefined, row.result), error => finish(error));
      } else if (row.type === 'error') finish(new Error(row.error ?? 'Local policy worker failed.'));
    });
    child.once('error', error => finish(error));
    child.once('exit', code => { if (!settled && !resultReceived) finish(new Error(`Local policy worker exited before its result (${code}).`)); });
    child.send(input.payload, error => { if (error) finish(error); });
  });
}
