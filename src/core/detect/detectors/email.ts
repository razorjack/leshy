import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

const USERINFO = /:\/\/[^\s/@]*:$/;

export const email: StructuralDetector = {
  id: "email",
  label: "Email address",
  type: "email",
  kind: "structural",
  enabled: true,
  match:
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}/g,
  keys: /^e?[-_]?mail$|_e?mail$/i,
  // `scheme://user:pass@host` reads as the email `pass@host`. That span belongs
  // to url-credentials, which keeps the host readable; a plausibility check
  // only, so the tier stays structural.
  heuristic: true,
  validate: (_text, input, start) => !USERINFO.test(input.slice(Math.max(0, start - 256), start)),
  generate: generators.email,
};
