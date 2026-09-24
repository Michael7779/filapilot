import { useNavigate } from "react-router-dom";
import { apiRequest } from "../lib/api.js";
import { useAuthStore } from "../stores/useAuthStore.js";
import { useThemeStore } from "../stores/useThemeStore.js";

export function useLogout(): () => Promise<void> {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const setStatus = useAuthStore((state) => state.setStatus);
  const resetAccent = useThemeStore((state) => state.resetToDefault);

  return async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setStatus("anonymous");
      resetAccent();
      navigate("/login");
    }
  };
}
