// Was der Drucker selbst in einem AMS-Fach meldet (Material und Farbe) - die Hilfe, um die passende Spule auszuwaehlen.
export function ReportedFilament({
  material,
  colorHex
}: {
  material: string | null;
  colorHex: string | null;
}): React.JSX.Element | null {
  if (!material && !colorHex) {
    return null;
  }
  return (
    <span className="flex items-center gap-1 font-medium text-[var(--color-text-primary)]">
      {colorHex && (
        <span
          className="size-3 shrink-0 rounded-full border border-[var(--color-border)]"
          style={{ backgroundColor: colorHex }}
          title={colorHex}
        />
      )}
      <span className="truncate">{material}</span>
    </span>
  );
}
