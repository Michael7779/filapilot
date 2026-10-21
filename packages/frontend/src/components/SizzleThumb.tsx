import { useState } from "react";

interface SizzleThumbProps {
  src: string | null;
  // Tailwind-Groesse, z.B. "h-14 w-14"
  size?: string;
}

// Kleines Produktbild vom Shop. Fehlt es oder laesst es sich nicht laden (Shop-CDN nicht erreichbar), erscheint ein neutraler
// Platzhalter statt eines kaputten Bildes. Ohne Referrer, damit die Adresse dieser Instanz nicht an den Shop weitergegeben wird.
export function SizzleThumb({ src, size = "h-14 w-14" }: SizzleThumbProps): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={`${size} flex shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)]`} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3c1 3.2 4.5 5 4.5 9.2A4.5 4.5 0 0 1 12 17a4.5 4.5 0 0 1-4.5-4.8c0-2 1-3.2 2-4.2.2 1.4.9 2 1.6 2.3C11 8 11 5.4 12 3z" />
        </svg>
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${size} shrink-0 rounded-lg border border-[var(--color-border)] bg-white object-cover`}
    />
  );
}
