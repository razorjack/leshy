import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

export const email: StructuralDetector = {
  id: "email",
  label: "Email address",
  type: "email",
  kind: "structural",
  enabled: true,
  match:
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}/g,
  keys: /^e?[-_]?mail$|_e?mail$/i,
  generate: generators.email,
};
