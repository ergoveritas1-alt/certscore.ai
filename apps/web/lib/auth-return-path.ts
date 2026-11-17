export function safeAuthReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) return '/app';
  try {
    const url = new URL(value, 'https://certscore.ai');
    if (url.origin !== 'https://certscore.ai' || url.pathname.startsWith('//')) return '/app';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/app'; }
}
export function authRetryPath(error: string, next: string | null | undefined) {
  return `/login?${new URLSearchParams({error, next:safeAuthReturnPath(next)})}`;
}
