import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-fg text-background hover:bg-fg/90",
        brand: "bg-brand text-brand-fg hover:bg-brand/90 shadow-[0_8px_24px_-10px_var(--brand)]",
        secondary: "bg-surface-2 text-fg hover:bg-surface-3",
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        outline: "border border-border-strong bg-transparent hover:bg-surface-2",
        yes: "bg-yes text-[oklch(0.2_0.05_155)] hover:bg-yes/90",
        no: "bg-no text-white hover:bg-no/90",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-[15px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
