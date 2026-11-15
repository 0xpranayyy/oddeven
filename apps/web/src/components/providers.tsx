"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";
import { useMarketsFeed } from "@/lib/hooks";

function LiveFeeds() {
  useMarketsFeed();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } } }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={qc}>
        <LiveFeeds />
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: "!bg-surface !text-fg !border-border-strong !rounded-2xl !shadow-card !font-sans",
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
