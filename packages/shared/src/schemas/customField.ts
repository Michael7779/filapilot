import { z } from "zod";

export const customFieldKindSchema = z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN"]);
export type CustomFieldKind = z.infer<typeof customFieldKindSchema>;

export const customFieldDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40),
  kind: customFieldKindSchema,
  // Pflichtfeld: eine Spule kann ohne Wert dafuer nicht angelegt/geaendert werden (siehe validateCustomFieldValues).
  required: z.boolean(),
  createdAt: z.coerce.date()
});
export type CustomFieldDefinition = z.infer<typeof customFieldDefinitionSchema>;

export const createCustomFieldDefinitionInputSchema = customFieldDefinitionSchema
  .omit({ id: true, createdAt: true, required: true })
  .extend({ required: z.boolean().optional().default(false) });
export type CreateCustomFieldDefinitionInput = z.infer<typeof createCustomFieldDefinitionInputSchema>;

// Werte, die eine Spule fuer die Zusatzfelder haelt: Schluessel = Definitions-ID, roh (noch nicht gegen die
// bekannten Definitionen geprueft). Zod allein kennt die dynamischen Schluessel/Typen nicht - das uebernimmt
// validateCustomFieldValues serverseitig gegen die tatsaechlichen Definitionen (Whitelist).
export const rawCustomFieldValuesSchema = z.record(z.string(), z.unknown());
export type RawCustomFieldValues = z.infer<typeof rawCustomFieldValuesSchema>;

export type CustomFieldValue = string | number | boolean | null;
export type CustomFieldValues = Record<string, CustomFieldValue>;
