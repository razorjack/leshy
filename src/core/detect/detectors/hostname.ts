import type { KeyDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// An internal hostname names a customer's server or a machine on their
// network. Only the key marks it: a bare `db.internal` reads like any word
// pair. An IP under the same key is a structural match and outranks this.
export const hostname: KeyDetector = {
  id: "hostname",
  label: "Hostname",
  type: "hostname",
  kind: "key",
  enabled: true,
  keys: /^(?:host|hostname|fqdn|server|server_?name|domain)$|_host(?:name)?$/i,
  generate: generators.hostname,
};
