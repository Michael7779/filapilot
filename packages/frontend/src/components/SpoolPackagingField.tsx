import { useTranslation } from "react-i18next";

interface SpoolPackagingFieldProps {
  isRefill: boolean;
  onChange: (isRefill: boolean) => void;
}

// Lieferform einer noch nicht angebrochenen Spule: Filament mit Spule oder Nachfuellung (ohne Spule).
export function SpoolPackagingField({ isRefill, onChange }: SpoolPackagingFieldProps): React.JSX.Element {
  const { t } = useTranslation();
  const options = [
    { value: false, label: t("spools.packaging.withSpool") },
    { value: true, label: t("spools.packaging.refill") }
  ];
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium text-[var(--color-text-secondary)]">{t("spools.packaging.label")}</legend>
      <div className="flex gap-4 text-sm text-[var(--color-text-primary)]">
        {options.map((option) => (
          <label key={String(option.value)} className="flex items-center gap-2">
            <input type="radio" name="spool-packaging" checked={isRefill === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
