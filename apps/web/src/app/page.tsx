import { HomeView } from "@/components/home-view";
import { type EventDTO, serverGet } from "@/lib/api";
import { ApiDown } from "./api-down";

export default async function Home() {
  const data = await serverGet<{ events: EventDTO[] }>("/events");
  if (!data) return <ApiDown />;
  return <HomeView events={data.events} />;
}
