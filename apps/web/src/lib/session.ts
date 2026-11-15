"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  token: string | null;
  setToken: (t: string | null) => void;
}

/**
 * Play-money guest session. Swapped for Better Auth + embedded wallets
 * when real money lands; the rest of the app only sees `token`.
 */
export const useSession = create<SessionState>()(
  persist((set) => ({ token: null, setToken: (token) => set({ token }) }), {
    name: "oddeven.session",
  }),
);
