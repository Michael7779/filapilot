import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColorPreset } from "@filapilot/shared";
import { ColorDot } from "./SpoolViews.js";

interface BulkSpoolColorPickerProps {
  presets: ColorPreset[];
  // Wie viele Spulen der Farbe schon in der Liste stehen (fuer die Anzeige am Farbknopf)
  countFor: (colorName: string) => number;
  disabled: boolean;
  onPick: (colorName: string, colorHex: string | null) => void;
}

const INPUT_CLASS = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm";

// Farbknoepfe des gewaehlten Herstellers + Materials: jeder Klick fuegt der Liste eine Spule hinzu. Fuer Farben ausserhalb
// der Vorlage gibt es darunter eine eigene Farbe (Name + Farbwert).
export function BulkSpoolColorPicker({ presets, countFor, disabled, onPick }: BulkSpoolColorPickerProps): React.JSX.Element {
  const { t } = useTranslation();
  const [customName, setCustomName] = useState("");
  const [customHex, setCustomHex] = useState("#808080");

  function addCustom(): void {
    if (customName.trim()) {
      onPick(customName.trim(), customHex);
      setCustomName("");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium text-[var(--color-text-secondary)]">{t("spools.bulk.colors")}</div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const count = countFor(preset.name);
          return (
            <button
              key={preset.name}
              type="button"
              disabled={disabled}
              onClick={() => onPick(preset.name, preset.hex)}
              title={preset.name}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
              <ColorDot hex={preset.hex} size="h-4 w-4" />
              {preset.name}
              {count > 0 && (
                <span className="rounded-full px-1.5 text-xs font-semibold text-white" style={{ backgroundColor: "var(--accent)" }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={customHex} onChange={(event) => setCustomHex(event.target.value)} aria-label={t("spools.bulk.customColorHex")} className="h-9 w-10 rounded-lg border border-[var(--color-border)]" />
        <input
          type="text"
          value={customName}
          maxLength={60}
          placeholder={t("spools.bulk.customColorName")}
          onChange={(event) => setCustomName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustom();
            }
          }}
          className={`min-w-0 flex-1 ${INPUT_CLASS}`}
        />
        <button type="button" disabled={disabled || !customName.trim()} onClick={addCustom} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium disabled:opacity-50">
          {t("spools.bulk.addCustomColor")}
        </button>
      </div>
    </div>
  );
}
