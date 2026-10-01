import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Manufacturer, Settings } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";

const SELECT_CLASS =
  "w-full min-w-0 max-w-md rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-primary)]";
const NONE = "";

// Admin-Einstellung: welcher Hersteller im "Neue Spule"-Formular vorbelegt ist (leer = kein Standard).
export function DefaultManufacturerSetting({
  settings,
  onSaved
}: {
  settings: Settings;
  onSaved: (settings: Settings) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [value, setValue] = useState(settings.defaultManufacturerId ?? NONE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Manufacturer[]>("/manufacturers")
      .then(setManufacturers)
      .catch(() => setManufacturers([]));
  }, []);

  async function handleChange(nextValue: string): Promise<void> {
    setValue(nextValue);
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiRequest<Settings>("/settings", {
        method: "PATCH",
        body: JSON.stringify({ defaultManufacturerId: nextValue === NONE ? null : nextValue })
      });
      onSaved(updated);
      setMessage(t("common.saved"));
    } catch (err) {
      setValue(settings.defaultManufacturerId ?? NONE);
      setMessage(err instanceof ApiRequestError ? err.message : t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-5">
      <h3 className="text-sm font-bold">{t("settings.defaultManufacturer")}</h3>
      <p className="text-xs text-[var(--color-text-muted)]">{t("settings.defaultManufacturerHint")}</p>
      <label className="flex max-w-md flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
        {t("settings.defaultManufacturer")}
        <select
          value={value}
          disabled={saving}
          onChange={(event) => void handleChange(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value={NONE}>{t("settings.defaultManufacturerNone")}</option>
          {sortAlphabetically(manufacturers, (m) => m.name, i18n.language).map((manufacturer) => (
            <option key={manufacturer.id} value={manufacturer.id}>
              {manufacturer.name}
            </option>
          ))}
        </select>
      </label>
      {message && <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>}
    </div>
  );
}
