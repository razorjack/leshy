import type { SemanticDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

export const person: SemanticDetector = {
  id: "person",
  label: "Person name",
  type: "person",
  kind: "semantic",
  enabled: true,
  labels: ["person"],
  keys: /(?:^|_)(?:first|last|full|middle|given|family|maiden)_?name$|^(?:name|surname)$/i,
  generate: generators.person,
};
