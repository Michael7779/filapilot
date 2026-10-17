import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCentsPlain, parseEuroInput } from "@filapilot/shared";
import { decimalSeparator } from "../lib/formatEuro.js";

interface EuroFieldProps {
  label: string;
  cents: number | null;
  // Wird beim Verlassen des Feldes (oder Enter) mit dem gueltigen Betrag aufgerufen; leeres Feld = null
  onCommit: (cents: number | null) => void;
  className?: string;
}

// Euro-Eingabe mit Komma oder Punkt; ungueltige Eingaben werden markiert und nicht gespeichert.
export function EuroField({ label, cents, onCommit, className }: EuroFieldProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const separator = decimalSeparator(i18n.language);
  const asText = (value: number | null): string => (value === null ? "" : formatCentsPlain(value, separator));
  const [text, setText] = useState(asText(cents));
  const [invalid, setInvalid] = useState(false);

  // Hat sich der gespeicherte Wert von aussen geaendert (z.B. Vorschlag uebernommen, Liste neu geladen), Anzeige nachziehen
  useEffect(() => {
    setText(asText(cents));
    setInvalid(false);
  }, [cents, separator]);

  function commit(): void {
    const parsed = parseEuroInput(text);
    if (parsed.kind === "invalid") {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const next = parsed.kind === "ok" ? parsed.cents : null;
    if (next === cents) {
      setText(asText(cents));
      return;
    }
    onCommit(next);
  }

  return (
    <label className={`flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)] ${className ?? ""}`}>
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={`0${separator}00`}
        aria-invalid={invalid}
        title={invalid ? t("wishlist.price.invalid") : undefined}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className={`w-24 rounded-lg border px-2 py-1.5 text-sm text-[var(--color-text-primary)] ${invalid ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"}`}
      />
    </label>
  );
}
