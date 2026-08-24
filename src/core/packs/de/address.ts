import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// The German counterpart of the Polish net: a compound street name ending in a
// recognisable suffix, a house number, optionally `, PLZ Stadt`. Suffixes that
// are also English word endings (ring, damm) are left out — a capitalised word
// ending in "ring" followed by a number is too easy to hit by accident.
export const address: StructuralDetector = {
  id: "de-address",
  label: "Address (DE)",
  type: "address",
  kind: "structural",
  enabled: true,
  match:
    /\b\p{Lu}[\p{L}-]*(?:[Ss]tra(?:ß|ss)e|[Ss]tr\.|[Ww]eg|[Aa]llee|[Pp]latz|[Gg]asse)\s+\d{1,4}\s*[a-zA-Z]?(?:,\s*\d{5}\s+\p{Lu}[\p{L}-]+)?/gu,
  generate: generators.address,
};
