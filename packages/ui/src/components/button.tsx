import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement } from "react";
import { cn } from "../lib/cn";

const buttonVariants = {
  primary: "bg-ink text-white hover:bg-slate-800",
  secondary: "bg-white text-ink ring-1 ring-slate-300 hover:bg-slate-50"
} as const;

const buttonSizes = {
  md: "h-11 px-4 text-sm",
  sm: "h-9 px-3 text-sm"
} as const;

type ButtonOwnProps = {
  asChild?: boolean;
  children: ReactNode;
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  className?: string;
};

type ButtonProps = ButtonOwnProps & ButtonHTMLAttributes<HTMLButtonElement>;
type AnchorProps = ButtonOwnProps & AnchorHTMLAttributes<HTMLAnchorElement>;

export function Button({
  asChild = false,
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps | AnchorProps) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-xl font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50",
    buttonVariants[variant],
    buttonSizes[size],
    className
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;

    return cloneElement(child, {
      className: cn(classes, child.props.className)
    });
  }

  return (
    <button className={classes} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
