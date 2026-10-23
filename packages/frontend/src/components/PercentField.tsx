import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBasisPoints, parsePercentInput } from "@filapilot/shared";
import { decimalSeparator } from "../lib/formatEuro.js";

interface PercentFieldProps {
  label: string;
  // Hundertstel-Prozent (10 % = 1000)
  basisPoints: number;
  // Wird beim Verlassen des Feldes (oder Enter) mit dem gueltigen Wert aufgerufen; leeres Feld = 0
  onCommit: (basisPoints: number) => void;
  className?: string;
}

// Prozent-Eingabe mit Komma oder Punkt (0 bis 100, hoechstens zwei Nachkommastellen); Ungueltiges wird markiert und nicht gespeichert.
export function PercentField({ label, basisPoints, onCommit, className }: PercentFieldProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const separator = decimalSeparator(i18n.language);
  const asText = (value: number): string => (value === 0 ? "" : formatBasisPoints(value, separator));
  const [text, setText] = useState(asText(basisPoints));
  const [invalid, setInvalid] = useState(false);

  // Hat sich der gespeicherte Wert von aussen geaendert (Liste neu geladen), Anzeige nachziehen
  useEffect(() => {
    setText(asText(basisPoints));
    setInvalid(false);
  }, [basisPoints, separator]);

  function commit(): void {
    const parsed = parsePercentInput(text);
    if (parsed.kind === "invalid") {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const next = parsed.kind === "ok" ? parsed.basisPoints : 0;
    if (next === basisPoints) {
      setText(asText(basisPoints));
      return;
    }
    onCommit(next);
  }

  return (
    <label className={`flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)] ${className ?? ""}`}>
      {label}
      <span className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={`0${separator}0`}
          aria-invalid={invalid}
          title={invalid ? t("sizzle.order.percentInvalid") : undefined}
          onChange={(event) => setText(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          className={`w-24 rounded-lg border py-1.5 pl-2 pr-6 text-sm text-[var(--color-text-primary)] ${invalid ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"}`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-[var(--color-text-muted)]" aria-hidden="true">
          %
        </span>
      </span>
    </label>
  );
}
