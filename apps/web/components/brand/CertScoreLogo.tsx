import Image from "next/image";
import Link from "next/link";
import { cn } from "@website-signal-risk-scanner/ui";

type CertScoreLogoProps = {
  className?: string;
  compact?: boolean;
  size?: "default" | "small";
  showText?: boolean;
  theme?: "light" | "dark";
};

type CertScoreMarkProps = {
  className?: string;
  compact?: boolean;
  theme?: "light" | "dark";
};

/**
 * CertScore.ai Logo Component
 *
 * Adjust brand colors in the constants below if needed.
 * Adjust rendered logo sizes via the wrapper classes on the icon/text spans.
 */
export default function CertScoreLogo({
  className,
  compact = false,
  size = "default",
  showText = false,
  theme = "light"
}: CertScoreLogoProps) {
  const NAVY = theme === "dark" ? "#F5F9FF" : "#0B2E4F";
  const GREEN = "#79BE34";

  return (
    <Link
      href="/"
      aria-label="CertScore.ai home"
      className={cn(
        "inline-flex items-center gap-3 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2",
        theme === "dark" ? "focus:ring-offset-slate-950" : "focus:ring-offset-white",
        className
      )}
    >
      <CertScoreMark compact={compact} theme={theme} className={compact ? (size === "small" ? "h-[2.1rem] w-auto" : "h-9 w-auto") : "h-[52px] w-auto"} />

      {!compact || showText ? (
        <span className="inline-flex items-baseline tracking-tight leading-none">
          <span className={cn("font-bold", compact ? (size === "small" ? "text-[1.28rem]" : "text-[1.35rem]") : "text-[1.7rem]")} style={{ color: NAVY }}>
            CertScore
          </span>
          <span className={cn("font-bold", compact ? (size === "small" ? "text-[1.28rem]" : "text-[1.35rem]") : "text-[1.7rem]")} style={{ color: GREEN }}>
            .ai
          </span>
        </span>
      ) : null}
    </Link>
  );
}

export function CertScoreMark({ className, compact = false, theme = "light" }: CertScoreMarkProps) {
  return (
    <Image
      src="/certscore_logo_alpha.png"
      alt=""
      width={109}
      height={93}
      className={cn("inline-flex shrink-0", compact ? "h-9 w-auto" : "h-[52px] w-auto", className)}
      priority
      aria-hidden="true"
    />
  );
}
