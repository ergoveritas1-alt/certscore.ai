function httpOrigin(value?: string): string | undefined {
  if (!value || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
}

// One instance belongs to one policy scan. A redirect identifies the origin
// which actually returned the denial. Sibling hosts and schemes stay separate.
export class PolicyGuessStop {
  private deniedHomepageOrigin?: string;
  private stopped = false;

  recordHomepage(status: number | undefined, responseUrl: string | undefined) {
    this.deniedHomepageOrigin = status === 403 ? httpOrigin(responseUrl) : undefined;
    this.stopped = false;
  }

  recordGuess(status: number | undefined, responseUrl: string | undefined) {
    if (status === 403 && this.deniedHomepageOrigin && httpOrigin(responseUrl) === this.deniedHomepageOrigin) {
      this.stopped = true;
    }
  }

  shouldSkipNewGuess(requestUrl: string) {
    return this.stopped && httpOrigin(requestUrl) === this.deniedHomepageOrigin;
  }
}
