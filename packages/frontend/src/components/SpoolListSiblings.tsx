import { useTranslation } from "react-i18next";
import { remainingPercent, type SpoolWithRelations } from "@filapilot/shared";
import { WeightBar } from "./SpoolViews.js";

interface SpoolListSiblingsProps {
  siblings: readonly SpoolWithRelations[];
  onJump: (spoolId: string) => void;
}

// Unter den Aktionen einer Spule: die weiteren Spulen desselben Filaments, je eine kleine Zeile mit Balken, Gramm und
// Prozent. Ein Klick springt zu dieser Spule in der Liste.
export function SpoolListSiblings({ siblings, onJump }: SpoolListSiblingsProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (siblings.length === 0) {
    return null;
  }
  return (
    <div className="mt-1.5 border-t border-dashed border-[var(--color-border)] pt-1 text-[11px] leading-tight text-[var(--color-text-secondary)]">
      <div>{t("spools.list.siblings", { n: siblings.length })}</div>
      <ul className="m-0 list-none p-0">
        {siblings.map((sibling) => {
          const grams = `${sibling.remainingWeightG} g · ${Math.round(remainingPercent(sibling))} %`;
          const hint = [sibling.location, sibling.openedAt ? null : t("spools.unopened")].filter(Boolean).join(" · ");
          return (
            <li key={sibling.id}>
              <button
                type="button"
                onClick={() => onJump(sibling.id)}
                title={hint ? t("spools.list.siblingJumpHint", { details: hint }) : t("spools.list.siblingJump")}
                aria-label={`${t("spools.list.siblingJump")}: ${grams}`}
                className="-mx-1 mt-0.5 flex w-full items-center gap-1.5 whitespace-nowrap rounded px-1 py-0.5 text-left hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
              >
                <span className="w-9 shrink-0">
                  <WeightBar spool={sibling} />
                </span>
                <span>{grams}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
