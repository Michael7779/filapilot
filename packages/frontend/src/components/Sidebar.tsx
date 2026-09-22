import { useTranslation } from "react-i18next";

const NAV_ITEMS = [
  { key: "dashboard", href: "/" },
  { key: "spools", href: "/spools" },
  { key: "printers", href: "/printers" },
  { key: "stats", href: "/stats" },
  { key: "settings", href: "/settings" }
] as const;

export function Sidebar(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-sidebar)] p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div
          className="h-7 w-7 rounded-lg"
          style={{ backgroundColor: "var(--accent)" }}
          aria-hidden="true"
        />
        <span className="text-base font-semibold tracking-tight">{t("app.name")}</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.key}
            href={item.href}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
          >
            {t(`nav.${item.key}`)}
          </a>
        ))}
      </nav>
    </aside>
  );
}
