import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { isNavActive, visibleNavItems } from "../lib/navItems.js";
import { useAccess } from "../hooks/useAccess.js";
import { NavIcon } from "./NavIcons.js";

// Mit allen Freigaben sind es sieben Punkte: die Beschriftungen sind hier kurz (nav.short.*), sonst laufen sie ineinander.
// Nur auf dem Smartphone sichtbar (die Seitenleiste ist dort ausgeblendet); Sicherheitsabstand
// unten fuer Geraete mit Gestenleiste / installierte PWA.
export function BottomNav(): React.JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();
  const access = useAccess();
  return (
    <nav
      aria-label={t("app.name")}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--color-border)] bg-[var(--color-sidebar)] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {visibleNavItems(access).map((item) => {
        const active = isNavActive(location.pathname, item.href);
        return (
          <Link
            key={item.key}
            to={item.href}
            aria-current={active ? "page" : undefined}
            className="flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0 py-1.5 text-[10px] font-medium"
            style={{ color: active ? "var(--accent)" : "var(--color-text-secondary)" }}
          >
            <NavIcon name={item.key} />
            <span className="max-w-full truncate text-center leading-[1.15]">{t(`nav.short.${item.key}`)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
