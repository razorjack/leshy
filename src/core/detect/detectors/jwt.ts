import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// eyJ is base64url for '{"' — every JWT header starts with it.
export const jwt: StructuralDetector = {
  id: "jwt",
  label: "JWT",
  type: "jwt",
  kind: "structural",
  enabled: true,
  match: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g,
  generate: generators.jwt,
};
