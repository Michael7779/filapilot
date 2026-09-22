// Zod-Partial-Objekte typisieren nicht gesendete Felder als `T | undefined`; Prisma-Update-Typen
// erlauben das mit `exactOptionalPropertyTypes: true` nicht (ein Feld soll fehlen, nicht explizit
// undefined sein). Entfernt alle undefined-Werte zur Laufzeit UND im Typ.
type WithoutUndefinedValues<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

export function omitUndefined<T extends object>(obj: T): WithoutUndefinedValues<T> {
  const result: WithoutUndefinedValues<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) {
      result[key] = value as Exclude<T[typeof key], undefined>;
    }
  }
  return result;
}
