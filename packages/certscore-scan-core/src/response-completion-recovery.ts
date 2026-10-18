/** Recover a missed response event from the exact completed browser request.
 * No URL matching, new network call, added wait window, or post-freeze write. */
export function createResponseCompletionRecovery<Request extends object, Response>(input: {
  finalized: () => boolean;
  responseFor: (request: Request) => Promise<Response | null>;
  requestOf: (response: Response) => Request;
  capture: (response: Response) => Promise<void>;
}) {
  const captured = new WeakSet<Request>();
  const attempted = new WeakSet<Request>();
  let attempts = 0;
  return {
    begin(request: Request) {
      if (input.finalized() || captured.has(request)) return false;
      captured.add(request);
      return true;
    },
    recover(request: Request): Promise<void> | undefined {
      if (input.finalized() || captured.has(request) || attempted.has(request) || attempts >= 8) return;
      attempted.add(request); attempts++;
      return input.responseFor(request).then(response => {
        if (!response || input.finalized() || captured.has(request) || input.requestOf(response) !== request) return;
        return input.capture(response);
      });
    },
  };
}
