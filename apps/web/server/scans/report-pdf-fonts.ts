// Standard PDF Helvetica advance widths (ASCII 32-126), in thousandths of an em.
const REGULAR_WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BOLD_WIDTHS = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

export function pdfTextWidth(text: string, size: number, bold = false) {
  const widths = bold ? BOLD_WIDTHS : REGULAR_WIDTHS;
  return [...text].reduce((sum, char) => sum + (widths[char.charCodeAt(0) - 32] ?? 556), 0) * size / 1000;
}
export function fitPdfText(text: string, width: number, size: number, bold = false) {
  if (pdfTextWidth(text, size, bold) <= width) return text;
  let shortened = text;
  while (shortened && pdfTextWidth(`${shortened}...`, size, bold) > width) shortened = shortened.slice(0, -1);
  return `${shortened.trimEnd()}...`;
}
export function wrapPdfText(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && pdfTextWidth(`${line} ${word}`, size, bold) > width) { lines.push(line); line = ""; }
    // Split long URLs, hashes and unbroken titles without dropping their contents.
    for (const char of (line ? ` ${word}` : word)) {
      if (line && pdfTextWidth(line + char, size, bold) > width) { lines.push(line); line = ""; }
      line += char;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}
