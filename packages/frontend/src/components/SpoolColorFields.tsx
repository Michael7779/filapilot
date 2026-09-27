import { useTranslation } from "react-i18next";

const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "Schwarz", hex: "#1A1A1A" },
  { name: "Weiß", hex: "#F5F5F0" },
  { name: "Grau", hex: "#8C8C88" },
  { name: "Rot", hex: "#D14343" },
  { name: "Orange", hex: "#E8622C" },
  { name: "Gelb", hex: "#F2C94C" },
  { name: "Grün", hex: "#4C8C3C" },
  { name: "Blau", hex: "#2F6FED" },
  { name: "Violett", hex: "#7F56D9" }
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface SpoolColorValue {
  colorName: string;
  colorHex: string;
  colorHex2: string;
}

interface SpoolColorFieldsProps {
  value: SpoolColorValue;
  onChange: (value: SpoolColorValue) => void;
}

// Farbname, Hauptfarbe (Voreinstellungen + freie Wahl) und optional eine zweite Farbe fuer zweifarbiges Filament.
export function SpoolColorFields({ value, onChange }: SpoolColorFieldsProps): React.JSX.Element {
  const { t } = useTranslation();
  const hasSecondColor = value.colorHex2 !== "";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-[var(--color-text-secondary)]">{t("spools.colorName")}</span>
      <div className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((preset) => {
          const isActive = value.colorHex.toLowerCase() === preset.hex.toLowerCase();
          return (
            <button
              key={preset.hex}
              type="button"
              title={preset.name}
              aria-label={preset.name}
              onClick={() => onChange({ ...value, colorName: preset.name, colorHex: preset.hex })}
              className="h-7 w-7 shrink-0 rounded-full border"
              style={{
                backgroundColor: preset.hex,
                borderColor: isActive ? "var(--accent)" : "var(--color-border)",
                borderWidth: isActive ? 2 : 1,
                boxShadow: isActive ? "0 0 0 2px var(--color-accent-bg)" : "none"
              }}
            />
          );
        })}
      </div>
      <div className="flex min-w-0 gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] px-2 py-1">
          <input
            type="color"
            aria-label={t("spools.colorHex")}
            value={HEX_PATTERN.test(value.colorHex) ? value.colorHex : "#cccccc"}
            onChange={(event) => onChange({ ...value, colorHex: event.target.value })}
            className="h-7 w-7 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0"
          />
          <input
            type="text"
            value={value.colorName}
            onChange={(event) => onChange({ ...value, colorName: event.target.value })}
            className="w-full min-w-0 text-[var(--color-text-primary)] focus:outline-none"
          />
        </div>
        <input
          type="text"
          aria-label={t("spools.colorHex")}
          placeholder="#000000"
          value={value.colorHex}
          onChange={(event) => onChange({ ...value, colorHex: event.target.value })}
          className="w-28 shrink-0 rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]"
        />
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)]">
        <input
          type="checkbox"
          checked={hasSecondColor}
          onChange={(event) => onChange({ ...value, colorHex2: event.target.checked ? "#ffffff" : "" })}
        />
        {t("spools.twoTone")}
      </label>
      {hasSecondColor && (
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--color-border)] px-2 py-1">
          <input
            type="color"
            aria-label={t("spools.colorHex2")}
            value={HEX_PATTERN.test(value.colorHex2) ? value.colorHex2 : "#ffffff"}
            onChange={(event) => onChange({ ...value, colorHex2: event.target.value })}
            className="h-7 w-7 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0"
          />
          <input
            type="text"
            aria-label={t("spools.colorHex2")}
            placeholder="#FFFFFF"
            value={value.colorHex2}
            onChange={(event) => onChange({ ...value, colorHex2: event.target.value })}
            className="w-full min-w-0 text-[var(--color-text-primary)] focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
