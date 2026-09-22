import { create } from "zustand";
import type { UserPublic } from "@filapilot/shared";

interface AuthState {
  user: UserPublic | null;
  setUser: (user: UserPublic | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user })
}));
