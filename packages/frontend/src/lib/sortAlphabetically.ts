// Alle Auswahllisten (<select>) sollen alphabetisch nach der angezeigten Beschriftung sortiert sein.
export function sortAlphabetically<T>(
  items: readonly T[],
  labelOf: (item: T) => string,
  locale: string
): T[] {
  return [...items].sort((a, b) =>
    labelOf(a).localeCompare(labelOf(b), locale, { sensitivity: "base", numeric: true })
  );
}
