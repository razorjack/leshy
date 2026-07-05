import type { SemanticDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

export const org: SemanticDetector = {
  id: "org",
  label: "Organization",
  type: "org",
  kind: "semantic",
  enabled: true,
  labels: ["organization"],
  keys: /company|organi[sz]ation|employer/i,
  generate: generators.org,
};
