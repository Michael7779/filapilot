import { useTranslation } from "react-i18next";
import type { CustomFieldDefinition, CustomFieldValue, CustomFieldValues } from "@filapilot/shared";

interface SpoolCustomFieldsFieldsProps {
  definitions: readonly CustomFieldDefinition[];
  values: CustomFieldValues;
  onChange: (values: CustomFieldValues) => void;
}

const INPUT_CLASS = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)]";
const INPUT_TYPE: Record<"TEXT" | "NUMBER" | "DATE", "text" | "number" | "date"> = { TEXT: "text", NUMBER: "number", DATE: "date" };

// Ein Eingabefeld je Admin-definiertem Zusatzfeld (Einstellungen -> Zusatzfelder), nach Typ passend gerendert.
export function SpoolCustomFieldsFields({ definitions, values, onChange }: SpoolCustomFieldsFieldsProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (definitions.length === 0) {
    return null;
  }

  function set(id: string, value: CustomFieldValue): void {
    onChange({ ...values, [id]: value });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3">
      <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{t("spools.customFields")}</span>
      {definitions.map((definition) => {
        const value = values[definition.id] ?? null;
        if (definition.kind === "BOOLEAN") {
          return (
            <label key={definition.id} className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={value === true} onChange={(event) => set(definition.id, event.target.checked)} />
              {definition.name}
            </label>
          );
        }
        const inputType = INPUT_TYPE[definition.kind];
        return (
          <label key={definition.id} className="flex flex-col gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
            {definition.name}
            <input
              type={inputType}
              value={value === null ? "" : String(value)}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") {
                  set(definition.id, null);
                } else {
                  set(definition.id, definition.kind === "NUMBER" ? Number(raw) : raw);
                }
              }}
              className={INPUT_CLASS}
            />
          </label>
        );
      })}
    </div>
  );
}
