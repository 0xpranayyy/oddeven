"use client";
import { Moon, Search, Sun, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useConnected, usePortfolio } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { CommandMenu } from "./command-menu";
import { Usd } from "./numbers";
import { Button } from "./ui/button";

const NAV = [
  { href: "/", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="relative grid size-7 place-items-center overflow-hidden rounded-lg bg-fg text-background">
        <span className="absolute inset-y-0 left-0 w-1/2 bg-yes" />
        <span className="absolute inset-y-0 right-0 w-1/2 bg-no" />
        <span className="relative size-3 rounded-full bg-background" />
      </span>
      <span className="text-[17px]">OddEven</span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                pathname === n.href ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto hidden h-9 w-full max-w-72 items-center gap-2 rounded-xl border bg-surface px-3 text-sm text-faint transition-colors hover:border-border-strong sm:flex md:ml-6"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search markets</span>
          <kbd className="hidden rounded-md border px-1.5 font-mono text-[10px] sm:block">⌘K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1.5 sm:ml-0 sm:gap-2 md:ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            aria-label="Search"
            onClick={() => setOpen(true)}
          >
            <Search />
          </Button>
          <LiveDot />
          <Balance />
          <ThemeToggle />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden scrollbar-none">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              pathname === n.href ? "bg-surface-2 text-fg" : "text-muted",
            )}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <CommandMenu open={open} onOpenChange={setOpen} />
    </header>
  );
}

function LiveDot() {
  const connected = useConnected();
  return (
    <span
      title={connected ? "Live" : "Reconnecting…"}
      className="hidden items-center gap-1.5 rounded-full px-2 text-xs text-faint lg:flex"
    >
      <span className={cn("size-1.5 rounded-full", connected ? "animate-pulse-dot bg-yes" : "bg-faint")} />
      {connected ? "Live" : "Offline"}
    </span>
  );
}

function Balance() {
  const { data } = usePortfolio();
  if (!data)
    return (
      <Button asChild variant="brand" size="sm">
        <Link href="/portfolio">
          <Wallet /> <span className="hidden sm:inline">Get</span> $1,000
        </Link>
      </Button>
    );
  return (
    <Link
      href="/portfolio"
      className="hidden h-9 items-center gap-3 rounded-xl border bg-surface px-3 text-sm sm:flex"
    >
      <span className="flex flex-col leading-none">
        <span className="text-[10px] uppercase tracking-wider text-faint">Portfolio</span>
        <Usd mills={data.equity} className="font-semibold" />
      </span>
      <span className="h-5 w-px bg-border-strong" />
      <span className="flex flex-col leading-none">
        <span className="text-[10px] uppercase tracking-wider text-faint">Cash</span>
        <Usd mills={data.account.cash - data.account.locked} className="font-semibold" />
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
