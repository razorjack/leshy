import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// Deterministic safety net for Polish street addresses — costs nothing and
// guarantees recall on the `ul. X 12/4, 00-001 City` anatomy even when the
// model is disabled or misses (validated in the spike).
export const address: StructuralDetector = {
  id: "pl-address",
  label: "Address (PL)",
  type: "address",
  kind: "structural",
  enabled: true,
  match:
    /\b(?:ul|al|os|pl)\.\s*\p{Lu}[\p{L}0-9. ]*?\s\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)?(?:,\s*\d{2}-\d{3}\s+\p{Lu}\p{L}+)?/gu,
  generate: generators.address,
};
