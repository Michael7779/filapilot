import { useTranslation } from "react-i18next";
import { isLowStockSpool, type SpoolWithRelations } from "@filapilot/shared";

interface WishlistQuickButtonProps {
  spool: SpoolWithRelations;
  onList: boolean;
  onAdd: (spool: SpoolWithRelations) => void;
  // true: bei knappen Spulen ein beschrifteter Knopf "Nachbestellen" (Listen- und Standardansicht), sonst nur das Symbol.
  labelled: boolean;
}

function BookmarkIcon({ filled }: { filled: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

// Ein Klick auf die Wunschliste: Symbol an jeder Spule; knappe Spulen bekommen zusaetzlich den beschrifteten Knopf
// "Nachbestellen". Steht die Spule schon auf der Liste, ist der Knopf ausgegraut (kein Doppeleintrag per Klick).
export function WishlistQuickButton({ spool, onList, onAdd, labelled }: WishlistQuickButtonProps): React.JSX.Element {
  const { t } = useTranslation();
  if (onList) {
    return (
      <button type="button" disabled title={t("spools.onWishlist")} aria-label={t("spools.onWishlist")} className="rounded-md p-2" style={{ color: "var(--accent)" }}>
        <BookmarkIcon filled />
      </button>
    );
  }
  if (labelled && isLowStockSpool(spool)) {
    return (
      <button
        type="button"
        onClick={() => onAdd(spool)}
        title={t("spools.addToWishlist")}
        className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium"
        style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
      >
        <BookmarkIcon filled={false} />
        {t("spools.reorder")}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onAdd(spool)}
      title={t("spools.addToWishlist")}
      aria-label={t("spools.addToWishlist")}
      className="rounded-md p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
    >
      <BookmarkIcon filled={false} />
    </button>
  );
}
