import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

export const mac: StructuralDetector = {
  id: "mac",
  label: "MAC address",
  type: "mac",
  kind: "structural",
  enabled: true,
  match: /(?<![\w:.-])(?:[0-9A-Fa-f]{2}([:-]))(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}(?![\w:.-])/g,
  keys: /^mac$|mac_?addr/i,
  generate: generators.mac,
};
