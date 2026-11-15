"use client";
import type { Market } from "@oddeven/shared";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { api, unwrap } from "@/lib/api";
import { useLiveMarkets } from "@/lib/hooks";
import { EventIcon } from "./market-card";

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["events"],
    queryFn: () => unwrap(api().events.$get({ query: {} })).then((r) => r.events),
    enabled: open,
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[14vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl"
        >
          <Dialog.Title className="sr-only">Search markets</Dialog.Title>
          <Command
            loop
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint"
          >
            <Command.Input
              autoFocus
              placeholder="Search markets, topics…"
              className="h-14 w-full border-b bg-transparent px-4 text-[15px] outline-none placeholder:text-faint"
            />
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              <Command.Empty className="p-6 text-center text-sm text-muted">No markets found.</Command.Empty>
              <Command.Group heading="Markets">
                {data?.map((e) => (
                  <Command.Item
                    key={e.id}
                    value={`${e.title} ${e.category} ${e.markets.map((m) => m.label).join(" ")}`}
                    onSelect={() => {
                      onOpenChange(false);
                      router.push(`/event/${e.slug}`);
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 data-[selected=true]:bg-surface-2"
                  >
                    <EventIcon image={e.image} className="size-9 text-base" />
                    <span className="flex-1 truncate text-sm">{e.title}</span>
                    <LeadOdds markets={e.markets as Market[]} />
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LeadOdds({ markets }: { markets: Market[] }) {
  const live = useLiveMarkets(markets);
  const top = live.reduce((a, b) => (b.lastPrice > a.lastPrice ? b : a));
  return (
    <span className="tnum text-sm text-muted">
      {markets.length > 1 && <span className="mr-1.5 text-faint">{top.label}</span>}
      {Math.round(top.lastPrice / 10)}%
    </span>
  );
}
