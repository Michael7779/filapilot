import type { CustomFieldDefinition, CustomFieldValue, CustomFieldValues, RawCustomFieldValues } from "./schemas/customField.js";

// Wird von der Route in eine 400-Antwort uebersetzt - nie eine Stack-Trace an den Client.
export class CustomFieldValidationError extends Error {}

function validateOne(definition: Pick<CustomFieldDefinition, "kind" | "name">, value: unknown): CustomFieldValue {
  if (value === null || value === "") {
    return null;
  }
  switch (definition.kind) {
    case "TEXT":
      if (typeof value !== "string" || value.length > 200) {
        throw new CustomFieldValidationError(`Zusatzfeld "${definition.name}": Text erwartet (max. 200 Zeichen).`);
      }
      return value;
    case "NUMBER":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new CustomFieldValidationError(`Zusatzfeld "${definition.name}": Zahl erwartet.`);
      }
      return value;
    case "DATE":
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        throw new CustomFieldValidationError(`Zusatzfeld "${definition.name}": Datum erwartet.`);
      }
      return value;
    case "BOOLEAN":
      if (typeof value !== "boolean") {
        throw new CustomFieldValidationError(`Zusatzfeld "${definition.name}": Ja/Nein erwartet.`);
      }
      return value;
    default:
      throw new CustomFieldValidationError(`Zusatzfeld "${definition.name}": unbekannter Typ.`);
  }
}

// Nur bekannte Zusatzfelder (Whitelist der Definitions-IDs) werden uebernommen, jeder Wert wird gegen den Typ
// seiner Definition geprueft. Ein unbekannter Schluessel oder falscher Typ wirft CustomFieldValidationError.
export function validateCustomFieldValues(
  definitions: readonly Pick<CustomFieldDefinition, "id" | "kind" | "name">[],
  raw: RawCustomFieldValues
): CustomFieldValues {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const result: CustomFieldValues = {};
  for (const [key, value] of Object.entries(raw)) {
    const definition = byId.get(key);
    if (!definition) {
      throw new CustomFieldValidationError(`Unbekanntes Zusatzfeld: ${key}`);
    }
    result[key] = validateOne(definition, value);
  }
  return result;
}
