import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & { tone?: "neutral" | "yes" | "no" | "brand" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "yes" && "bg-yes-soft text-yes",
        tone === "no" && "bg-no-soft text-no",
        tone === "brand" && "bg-brand/12 text-brand",
        className,
      )}
      {...props}
    />
  );
}
