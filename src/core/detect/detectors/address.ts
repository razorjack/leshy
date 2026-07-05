import type { SemanticDetector, StructuralDetector } from "../../types.ts";
import { todoGenerate } from "../../generate/todo.ts";

export const address: SemanticDetector = {
  id: "address",
  label: "Address",
  type: "address",
  kind: "semantic",
  enabled: true,
  labels: ["address", "location"],
  keys: /address|street|(?:^|_)city$|zip|post_?code|postal/i,
  generate: todoGenerate("address"),
};

// Deterministic safety net for Polish street addresses — costs nothing and
// guarantees recall on the `ul. X 12/4, 00-001 City` anatomy even when the
// model is disabled or misses (validated in the spike).
export const plAddress: StructuralDetector = {
  id: "pl-address",
  label: "Address",
  type: "address",
  kind: "structural",
  enabled: true,
  match:
    /\b(?:ul|al|os|pl)\.\s*\p{Lu}[\p{L}0-9. ]*?\s\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)?(?:,\s*\d{2}-\d{3}\s+\p{Lu}\p{L}+)?/gu,
  generate: todoGenerate("pl-address"),
};
