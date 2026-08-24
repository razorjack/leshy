import type { KeyDetector, SemanticDetector } from "../../types.ts";
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
