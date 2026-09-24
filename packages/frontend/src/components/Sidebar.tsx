import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { NAV_ITEMS, isNavActive } from "../lib/navItems.js";
import { useLogout } from "../hooks/useLogout.js";
import { useAuthStore } from "../stores/useAuthStore.js";

function initialsFor(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();

  return (
    <aside className="hidden w-60 shrink-0 flex-col md:flex border-r border-[var(--color-border)] bg-[var(--color-sidebar)] p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <img src="/icons/icon.svg" alt="" className="h-7 w-7" aria-hidden="true" />
        <span className="text-base font-semibold tracking-tight">{t("app.name")}</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = isNavActive(location.pathname, item.href);
          if (!item.enabled) {
            return (
              <span
                key={item.key}
                className="cursor-not-allowed rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-muted)]"
              >
                {t(`nav.${item.key}`)}
              </span>
            );
          }
          return (
            <Link
              key={item.key}
              to={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--color-bg)]"
              style={
                isActive
                  ? { color: "var(--accent)", backgroundColor: "var(--color-accent-bg)" }
                  : { color: "var(--color-text-secondary)" }
              }
            >
              {t(`nav.${item.key}`)}
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="mt-auto flex items-center gap-2 border-t border-[var(--color-border)] px-2 pt-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ backgroundColor: "var(--color-accent-bg)", color: "var(--accent)" }}
          >
            {initialsFor(user.username)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user.username}</div>
            <div className="text-xs text-[var(--color-text-muted)]">{user.role}</div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
          >
            {t("common.logout")}
          </button>
        </div>
      )}
    </aside>
  );
}
