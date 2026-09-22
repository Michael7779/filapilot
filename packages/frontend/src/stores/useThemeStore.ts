import { create } from "zustand";

const DEFAULT_ACCENT = "#2F6FED";

interface ThemeState {
  accentColor: string;
  setAccentColor: (color: string | null) => void;
  resetToDefault: () => void;
}

function applyAccentColor(color: string): void {
  document.documentElement.style.setProperty("--accent", color);
}

export const useThemeStore = create<ThemeState>((set) => ({
  accentColor: DEFAULT_ACCENT,
  setAccentColor: (color) => {
    const resolved = color ?? DEFAULT_ACCENT;
    applyAccentColor(resolved);
    set({ accentColor: resolved });
  },
  resetToDefault: () => {
    applyAccentColor(DEFAULT_ACCENT);
    set({ accentColor: DEFAULT_ACCENT });
  }
}));

export { DEFAULT_ACCENT };
