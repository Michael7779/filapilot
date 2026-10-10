import { useTranslation } from "react-i18next";
import { getColorPresets, type ColorPreset } from "@filapilot/shared";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

export interface WishlistColor {
  name: string;
  hex: string;
}

interface WishlistColorSelectProps {
  value: WishlistColor | null;
  onChange: (color: WishlistColor | null) => void;
  // Namen (nicht IDs) - der Farbkatalog ist ueber Hersteller+Material-Namen indiziert, siehe getColorPresets.
  manufacturerName: string | null;
  materialName: string | null;
  className: string;
}

// Farben, die zur aktuellen Auswahl angeboten werden; eine schon gespeicherte Farbe, die nicht (mehr) in der Liste
// steht (z.B. nach Wechsel des Materials), bleibt als Eintrag erhalten, damit sie beim Bearbeiten nicht verschwindet.
export function colorOptionsFor(
  manufacturerName: string | null,
  materialName: string | null,
  current: WishlistColor | null,
  locale: string
): ColorPreset[] {
  const presets = getColorPresets(manufacturerName, materialName);
  const options = current && !presets.some((preset) => preset.name === current.name) ? [...presets, current] : presets;
  return sortAlphabetically(options, (preset) => preset.name, locale);
}

export function WishlistColorSelect({ value, onChange, manufacturerName, materialName, className }: WishlistColorSelectProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const options = colorOptionsFor(manufacturerName, materialName, value, i18n.language);

  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)] sm:flex-1">
      {t("wishlist.color")}
      <select
        value={value?.name ?? ""}
        onChange={(event) => onChange(options.find((option) => option.name === event.target.value) ?? null)}
        className={className}
      >
        <option value="">{t("wishlist.anyColor")}</option>
        {options.map((option) => (
          <option key={option.name} value={option.name}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
