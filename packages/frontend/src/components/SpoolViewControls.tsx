import { useTranslation } from "react-i18next";
import { SPOOL_PAGE_SIZES, SPOOL_VIEWS, spoolPageSizeSchema, type SpoolView } from "@filapilot/shared";

const iconProps = { viewBox: "0 0 24 24", className: "h-4 w-4", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function ViewIcon({ view }: { view: SpoolView }): React.JSX.Element {
  switch (view) {
    case "compact":
      return (
        <svg {...iconProps}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "list":
      return (
        <svg {...iconProps}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case "swatch":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="8" cy="10" r="1" />
          <circle cx="12" cy="7.5" r="1" />
          <circle cx="16" cy="10" r="1" />
        </svg>
      );
    default:
      return (
        <svg {...iconProps}>
          <rect x="3" y="3" width="18" height="8" rx="1" />
          <rect x="3" y="14" width="18" height="7" rx="1" />
        </svg>
      );
  }
}

interface SpoolViewSwitchProps {
  view: SpoolView;
  onChange: (view: SpoolView) => void;
}

// Umschalter Standard / Kompakt / Liste / Farbkacheln
export function SpoolViewSwitch({ view, onChange }: SpoolViewSwitchProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)]" role="group" aria-label={t("spools.view.label")}>
      {SPOOL_VIEWS.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          title={t(`spools.view.${value}`)}
          onClick={() => onChange(value)}
          className="flex items-center gap-1.5 border-r border-[var(--color-border)] px-3 py-1.5 text-xs font-medium last:border-r-0"
          style={view === value ? { color: "var(--accent)", backgroundColor: "var(--color-accent-bg)" } : { color: "var(--color-text-secondary)" }}
        >
          <ViewIcon view={value} />
          <span className="hidden sm:inline">{t(`spools.view.${value}`)}</span>
        </button>
      ))}
    </div>
  );
}

interface SpoolPagerProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

// Anzahl pro Seite (0 = alle) und Blaettern
export function SpoolPager({ page, pageCount, pageSize, total, onPage, onPageSize }: SpoolPagerProps): React.JSX.Element {
  const { t } = useTranslation();
  const button = "rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]">
      <label className="flex items-center gap-2">
        {t("spools.pager.perPage")}
        <select
          value={pageSize}
          onChange={(event) => {
            const parsed = spoolPageSizeSchema.safeParse(Number(event.target.value));
            if (parsed.success) {
              onPageSize(parsed.data);
            }
          }}
          className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-[var(--color-text-primary)]"
        >
          {SPOOL_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size === 0 ? t("spools.pager.all") : size}
            </option>
          ))}
        </select>
      </label>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>
            {t("spools.pager.prev")}
          </button>
          <span>{t("spools.pager.page", { page, count: pageCount, total })}</span>
          <button type="button" className={button} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            {t("spools.pager.next")}
          </button>
        </div>
      )}
    </div>
  );
}
