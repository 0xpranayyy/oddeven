"use client";

type Listener = (type: string, data: unknown) => void;

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  (typeof window !== "undefined"
    ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:8787/v1/ws`
    : "");

/**
 * One multiplexed socket for the whole app. Ref-counted channel subscriptions,
 * auto-reconnect with jittered backoff, resubscribe + re-auth on reconnect.
 */
class Realtime {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private token: string | null = null;
  private attempts = 0;
  private statusListeners = new Set<(s: boolean) => void>();
  connected = false;

  private connect() {
    if (this.ws || typeof window === "undefined") return;
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.setConnected(true);
      if (this.token) this.send({ op: "auth", token: this.token });
      for (const channel of this.listeners.keys()) this.send({ op: "subscribe", channel });
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as { channel: string; type: string; data: unknown };
      for (const l of this.listeners.get(msg.channel) ?? []) l(msg.type, msg.data);
    };
    ws.onclose = () => {
      this.ws = null;
      this.setConnected(false);
      const delay = Math.min(10_000, 500 * 2 ** this.attempts++) * (0.7 + Math.random() * 0.6);
      setTimeout(() => this.connect(), delay);
    };
  }

  private setConnected(v: boolean) {
    this.connected = v;
    for (const l of this.statusListeners) l(v);
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  auth(token: string | null) {
    this.token = token;
    if (token) this.send({ op: "auth", token });
  }

  subscribe(channel: string, l: Listener): () => void {
    this.connect();
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      this.send({ op: "subscribe", channel });
    }
    set.add(l);
    return () => {
      set.delete(l);
      if (set.size === 0) {
        this.listeners.delete(channel);
        this.send({ op: "unsubscribe", channel });
      }
    };
  }

  onStatus(l: (s: boolean) => void) {
    this.connect();
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }
}

export const realtime = new Realtime();
