import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { customFieldKindSchema, type CustomFieldDefinition, type CustomFieldKind } from "@filapilot/shared";
import { apiRequest, ApiRequestError } from "../lib/api.js";
import { sortAlphabetically } from "../lib/sortAlphabetically.js";
import { useAuthStore } from "../stores/useAuthStore.js";

const INPUT_CLASS = "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)]";

// Admin-verwaltete Zusatzfelder (Name + Typ), die im Spulen-Formular als freie Felder erscheinen.
export function CustomFieldSettings(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const isAdmin = useAuthStore((state) => state.user?.role === "ADMIN");
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[] | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CustomFieldKind>("TEXT");
  const [required, setRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    try {
      setDefinitions(await apiRequest<CustomFieldDefinition[]>("/custom-field-definitions"));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("settings.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleAdd(): Promise<void> {
    if (!name.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/custom-field-definitions", { method: "POST", body: JSON.stringify({ name: name.trim(), kind, required }) });
      setName("");
      setRequired(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("settings.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(definition: CustomFieldDefinition): Promise<void> {
    if (!window.confirm(t("catalog.customFields.confirmDelete", { name: definition.name }))) {
      return;
    }
    await apiRequest(`/custom-field-definitions/${definition.id}`, { method: "DELETE" });
    await load();
  }

  async function toggleRequired(definition: CustomFieldDefinition): Promise<void> {
    try {
      await apiRequest(`/custom-field-definitions/${definition.id}`, {
        method: "PATCH",
        body: JSON.stringify({ required: !definition.required })
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("settings.saveFailed"));
    }
  }

  if (!definitions) {
    return <></>;
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <h3 className="mb-1 text-sm font-bold">{t("catalog.customFields.title")}</h3>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">{t("catalog.customFields.hint")}</p>
      {error && <p className="mb-2 text-sm text-[var(--color-danger)]">{error}</p>}
      {definitions.length === 0 ? (
        <p className="mb-3 text-sm text-[var(--color-text-secondary)]">{t("catalog.customFields.empty")}</p>
      ) : (
        <ul className="mb-3 flex flex-col">
          {sortAlphabetically(definitions, (definition) => definition.name, i18n.language).map((definition) => (
            <li key={definition.id} className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] py-2 text-sm first:border-t-0">
              <span>
                {definition.name} <span className="text-[var(--color-text-muted)]">({t(`catalog.customFields.kind.${definition.kind}`)})</span>
                {definition.required && (
                  <span className="ml-2 rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
                    {t("catalog.customFields.required")}
                  </span>
                )}
              </span>
              {isAdmin && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => void toggleRequired(definition)} className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                    {definition.required ? t("catalog.customFields.makeOptional") : t("catalog.customFields.makeRequired")}
                  </button>
                  <button type="button" onClick={() => void handleDelete(definition)} className="text-xs font-medium text-[var(--color-danger)]">
                    {t("common.delete")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]">
            {t("catalog.customFields.name")}
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--color-text-secondary)]">
            {t("catalog.customFields.kindLabel")}
            <select value={kind} onChange={(event) => setKind(customFieldKindSchema.parse(event.target.value))} className={INPUT_CLASS}>
              {customFieldKindSchema.options.map((option) => (
                <option key={option} value={option}>
                  {t(`catalog.customFields.kind.${option}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-xs font-medium text-[var(--color-text-secondary)]">
            <input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />
            {t("catalog.customFields.required")}
          </label>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void handleAdd()}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {t("catalog.customFields.add")}
          </button>
        </div>
      )}
    </div>
  );
}
