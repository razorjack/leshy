import type { SemanticDetector } from "../../types.ts";
import { todoGenerate } from "../../generate/todo.ts";

export const person: SemanticDetector = {
  id: "person",
  label: "Person name",
  type: "person",
  kind: "semantic",
  enabled: true,
  labels: ["person"],
  keys: /(?:^|_)(?:first|last|full|middle|given|family|maiden|user)_?name$|^(?:name|surname)$/i,
  generate: todoGenerate("person"),
};
