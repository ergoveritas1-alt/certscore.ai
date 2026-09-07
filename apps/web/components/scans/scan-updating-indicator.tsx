/** A quiet marker for values that can still change during the scan. */
export function ScanUpdatingIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="ml-1.5 inline-flex shrink-0 align-middle text-slate-400" role="img" aria-label="Updating as scan progresses" title="Updating as scan progresses">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3 motion-safe:animate-[scan-hourglass-flip_3.2s_ease-in-out_infinite]" fill="none">
        <path d="M5 3h14M5 21h14M7 3v4c0 2 3 4 5 5-2 1-5 3-5 5v4M17 3v4c0 2-3 4-5 5 2 1 5 3 5 5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 6h6v1l-3 3-3-3V6Zm3 8 3 3v2H9v-2l3-3Z" fill="currentColor" />
      </svg>
    </span>
  );
}
