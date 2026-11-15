"use client";
import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Segmented control with a shared-layout sliding indicator. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; tone?: "yes" | "no" }[];
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div role="tablist" className={cn("relative flex rounded-xl bg-surface-2 p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex-1 rounded-lg font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3 text-sm",
              active ? "text-fg" : "text-muted hover:text-fg",
              active && o.tone === "yes" && "text-yes",
              active && o.tone === "no" && "text-no",
            )}
          >
            {active && (
              <motion.span
                layoutId={id}
                className={cn(
                  "absolute inset-0 rounded-lg bg-surface shadow-sm dark:bg-surface-3",
                  o.tone === "yes" && "bg-yes-soft dark:bg-yes-soft",
                  o.tone === "no" && "bg-no-soft dark:bg-no-soft",
                )}
                transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
