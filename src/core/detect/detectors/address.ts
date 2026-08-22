import type { KeyDetector, SemanticDetector, StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

export const address: SemanticDetector = {
  id: "address",
  label: "Address",
  type: "address",
  kind: "semantic",
  enabled: true,
  labels: ["address", "location"],
  keys: /address/i,
  generate: generators.address,
};

// Address components under their own keys. A `city` or `zip` field holds one
// part of an address; replacing it with a whole street address would corrupt
// the record. Declared before `address` in the registry so the keyed lookup
// prefers the narrower match (`address_line1` is a street, not an address).
export const street: KeyDetector = {
  id: "street",
  label: "Street",
  type: "street",
  kind: "key",
  enabled: true,
  keys: /street|address_?line/i,
  generate: generators.street,
};

export const city: KeyDetector = {
  id: "city",
  label: "City",
  type: "city",
  kind: "key",
  enabled: true,
  keys: /(?:^|_)(?:city|town)$|locality/i,
  generate: generators.city,
};

export const postcode: KeyDetector = {
  id: "postcode",
  label: "Postal code",
  type: "postcode",
  kind: "key",
  enabled: true,
  keys: /zip|post_?code|postal/i,
  generate: generators.postcode,
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
  generate: generators.address,
};
