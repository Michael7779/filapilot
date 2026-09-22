import { create } from "zustand";
import type { UserPublic } from "@filapilot/shared";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  user: UserPublic | null;
  status: AuthStatus;
  setUser: (user: UserPublic | null) => void;
  setStatus: (status: AuthStatus) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",
  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status })
}));
