import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventView } from "@/components/event-view";
import { type EventDTO, serverGet } from "@/lib/api";

type Props = { params: Promise<{ slug: string }> };

const load = (slug: string) => serverGet<{ event: EventDTO }>(`/events/${encodeURIComponent(slug)}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug);
  return { title: data?.event.title ?? "Market", description: data?.event.description };
}

export default async function EventPage({ params }: Props) {
  const data = await load((await params).slug);
  if (!data) notFound();
  return (
    <Suspense>
      <EventView event={data.event} />
    </Suspense>
  );
}
