/** Only the canonical build region needs the base: regional app images are
 * replicated after one build. Never silently upgrade Chromium on a routine
 * application release when that base is unavailable. */
export async function scannerRuntimeBaseMode(input: {
  buildRegion: string;
  rebuild: boolean;
  available: (region: string) => Promise<boolean>;
}): Promise<"rebuilt" | "reused"> {
  if (input.rebuild) return "rebuilt";
  if (await input.available(input.buildRegion)) return "reused";
  throw new Error(`Scanner runtime base is unavailable in ${input.buildRegion}; restore the verified base or explicitly rebuild it. Routine releases must not rebuild Chromium implicitly.`);
}
