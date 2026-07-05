import type { SemanticDetector } from "../../types.ts";
import { todoGenerate } from "../../generate/todo.ts";

export const org: SemanticDetector = {
  id: "org",
  label: "Organization",
  type: "org",
  kind: "semantic",
  enabled: true,
  labels: ["organization"],
  keys: /company|organi[sz]ation|employer/i,
  generate: todoGenerate("org"),
};
