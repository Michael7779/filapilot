import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sidebar } from "./components/Sidebar.js";
import { DashboardPage } from "./pages/DashboardPage.js";

function TopBar(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <header className="flex h-[68px] shrink-0 items-center border-b border-[var(--color-border)] px-7">
      <h1 className="text-[19px] font-bold">{t("nav.dashboard")}</h1>
    </header>
  );
}

function AppShell(): React.JSX.Element {
  return (
    <div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto p-7">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
