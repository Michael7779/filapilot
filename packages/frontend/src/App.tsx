import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  type Location
} from "react-router-dom";
import { ChangelogButton } from "./components/ChangelogButton.js";
import { InventorySwitcher } from "./components/InventorySwitcher.js";
import { NoInventory } from "./components/NoInventory.js";
import { useTranslation } from "react-i18next";
import type { UserPublic } from "@filapilot/shared";
import { Sidebar } from "./components/Sidebar.js";
import { BottomNav } from "./components/BottomNav.js";
import { UpdateBanner } from "./components/UpdateBanner.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SetupPage } from "./pages/SetupPage.js";
import { ChangePasswordPage } from "./pages/ChangePasswordPage.js";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.js";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.js";
import { SpoolsPage } from "./pages/SpoolsPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { PrintersPage } from "./pages/PrintersPage.js";
import { StatsPage } from "./pages/StatsPage.js";
import { apiRequest } from "./lib/api.js";
import { useAuthStore } from "./stores/useAuthStore.js";
import { useThemeStore } from "./stores/useThemeStore.js";
import { useInventoryStore } from "./stores/useInventoryStore.js";

const TITLE_BY_PATH: Record<string, string> = {
  "/": "nav.dashboard",
  "/spools": "nav.spools",
  "/printers": "nav.printers",
  "/stats": "nav.stats",
  "/settings": "nav.settings"
};

function TopBar(): React.JSX.Element {
  const { t } = useTranslation();
  const location: Location = useLocation();
  const path = location.pathname.startsWith("/settings") ? "/settings" : location.pathname;
  const titleKey = TITLE_BY_PATH[path] ?? "nav.dashboard";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 pt-[env(safe-area-inset-top)] md:h-[68px] md:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="text-[17px] font-bold md:text-[19px]">{t(titleKey)}</h1>
        <div className="min-w-0 md:hidden">
          <InventorySwitcher variant="header" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-xs text-[var(--color-text-muted)] md:inline">v{__APP_VERSION__}</span>
        <ChangelogButton />
      </div>
    </header>
  );
}

function AppContent(): React.JSX.Element {
  const { t } = useTranslation();
  const location: Location = useLocation();
  const loaded = useInventoryStore((state) => state.loaded);
  const hasInventories = useInventoryStore((state) => state.inventories.length > 0);

  if (!loaded) {
    return <div>{t("common.loading")}</div>;
  }
  // Ohne Lager gibt es nichts zu zeigen - ausser den Einstellungen (dort laesst sich eines anlegen).
  if (!hasInventories && !location.pathname.startsWith("/settings")) {
    return <NoInventory />;
  }
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/spools" element={<SpoolsPage />} />
      <Route path="/printers" element={<PrintersPage />} />
      <Route path="/stats" element={<StatsPage />} />
      <Route path="/settings/:tab?" element={<SettingsPage />} />
    </Routes>
  );
}

function AppShell(): React.JSX.Element {
  const load = useInventoryStore((state) => state.load);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <div className="flex h-dvh bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto p-4 pb-24 md:p-7 md:pb-7">
          <AppContent />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

function RequireAuth({ children }: { children: React.JSX.Element }): React.JSX.Element {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const location: Location = useLocation();

  if (status === "loading") {
    return <div className="flex h-dvh items-center justify-center">{t("common.loading")}</div>;
  }
  if (status === "anonymous") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (user?.mustChangePassword && location.pathname !== "/passwort-aendern") {
    return <Navigate to="/passwort-aendern" replace />;
  }
  return children;
}

function AuthBootstrap({ children }: { children: React.JSX.Element }): React.JSX.Element {
  const setUser = useAuthStore((state) => state.setUser);
  const setStatus = useAuthStore((state) => state.setStatus);
  const setAccentColor = useThemeStore((state) => state.setAccentColor);

  useEffect(() => {
    apiRequest<UserPublic>("/users/me")
      .then((me) => {
        setUser(me);
        setStatus("authenticated");
        setAccentColor(me.themeAccentColor);
      })
      .catch(() => {
        setStatus("anonymous");
      });
  }, [setAccentColor, setStatus, setUser]);

  return children;
}

export default function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <UpdateBanner />
      <AuthBootstrap>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/einrichtung" element={<SetupPage />} />
          <Route path="/passwort-vergessen" element={<ForgotPasswordPage />} />
          <Route path="/passwort-zuruecksetzen" element={<ResetPasswordPage />} />
          <Route
            path="/passwort-aendern"
            element={
              <RequireAuth>
                <ChangePasswordPage />
              </RequireAuth>
            }
          />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthBootstrap>
    </BrowserRouter>
  );
}
