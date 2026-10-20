import { useState } from "react";
import { useTranslation } from "react-i18next";
import { spoolPackaging, type SpoolPackaging, type SpoolWithRelations } from "@filapilot/shared";

interface PackagingIconProps {
  spool: Pick<SpoolWithRelations, "openedAt" | "archivedAt" | "isRefill">;
  size?: number;
  className?: string;
}

// Spule von der Seite: Flanschrand, Nabe und drei Aussparungen (selbst gezeichnet).
function SpoolShape(): React.JSX.Element {
  return (
    <>
      <circle cx="12" cy="12" r="10.4" />
      <circle cx="12" cy="12" r="3.7" />
      <circle cx="12" cy="12" r="1.2" />
      <ellipse cx="18.15" cy="15.55" rx=".9" ry="2.2" transform="rotate(30 18.15 15.55)" />
      <ellipse cx="5.85" cy="15.55" rx=".9" ry="2.2" transform="rotate(150 5.85 15.55)" />
      <ellipse cx="12" cy="4.9" rx=".9" ry="2.2" transform="rotate(270 12 4.9)" />
    </>
  );
}

// Nachfuellung: zwei Pfeile im Kreis (Pfeile aus Lucide "refresh-cw", ISC-Lizenz) mit einer Filamentrolle ohne Spule
// (Wickel mit Pappkern) in der Mitte.
function RefillShape(): React.JSX.Element {
  return (
    <>
      <path d="M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1.7" />
    </>
  );
}

// Dezente Farben: Spule gruen, Nachfuellung rot (Theme-Farben, abgeschwaecht, damit die Symbole nicht schreien)
const COLOR: Record<SpoolPackaging, string> = {
  WITH_SPOOL: "color-mix(in srgb, var(--color-success) 80%, transparent)",
  REFILL: "color-mix(in srgb, var(--color-danger) 70%, transparent)"
};

const LABEL_KEY: Record<SpoolPackaging, string> = { REFILL: "spools.packaging.refill", WITH_SPOOL: "spools.packaging.withSpool" };
const SHORT_KEY: Record<SpoolPackaging, string> = { REFILL: "spools.packaging.refill", WITH_SPOOL: "spools.packaging.withSpoolShort" };

// Lieferform einer ungeoeffneten Spule als eigenes Symbol: Mouseover zeigt den Text; ein Tippen blendet ihn daneben ein
// (fuer Touch-Geraete ohne Mouseover). Bei angefangenen/archivierten Spulen erscheint nichts.
export function PackagingIcon({ spool, size = 24, className = "" }: PackagingIconProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const packaging = spoolPackaging(spool);
  if (!packaging) {
    return null;
  }
  const label = t(LABEL_KEY[packaging]);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={open}
      onClick={(event) => {
        event.stopPropagation();
        setOpen((current) => !current);
      }}
      onBlur={() => setOpen(false)}
      style={{ color: COLOR[packaging] }}
      className={`inline-flex shrink-0 items-center gap-1 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={size >= 28 ? 1.6 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {packaging === "REFILL" ? <RefillShape /> : <SpoolShape />}
      </svg>
      {open && <span className="pr-1 text-xs font-medium">{t(SHORT_KEY[packaging])}</span>}
    </button>
  );
}
