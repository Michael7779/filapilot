import { useState } from "react";

// Merkt sich, welche Zeilen aufgeklappt sind (mehrere gleichzeitig moeglich); Start: alles zugeklappt.
export function useExpandedSet(): { isExpanded: (key: string) => boolean; toggle: (key: string) => void } {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  function toggle(key: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  }

  return { isExpanded: (key) => expanded.has(key), toggle };
}
