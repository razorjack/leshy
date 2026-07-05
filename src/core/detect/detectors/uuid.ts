import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// Off by default: UUIDs in debugging output are almost always database ids,
// which Leshy preserves (docs/adr/0004-preserve-vs-redact.md). Enable via
// leshy.config.ts `enable: ['uuid']` when they are session or user tokens.
export const uuid: StructuralDetector = {
  id: "uuid",
  label: "UUID",
  type: "uuid",
  kind: "structural",
  enabled: false,
  match: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  generate: generators.uuid,
};
