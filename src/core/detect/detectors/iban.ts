import type { StructuralDetector } from "../../types.ts";
import { todoGenerate } from "../../generate/todo.ts";

const mod97 = (iban: string): boolean => {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const chunk of expanded.match(/.{1,7}/g) ?? []) {
    remainder = Number(String(remainder) + chunk) % 97;
  }
  return remainder === 1;
};

export const iban: StructuralDetector = {
  id: "iban",
  label: "IBAN",
  type: "iban",
  kind: "structural",
  enabled: true,
  match: /(?<![A-Z0-9])[A-Z]{2}\d{2}[A-Z0-9]{11,30}(?![A-Z0-9])/g,
  keys: /iban|account_?(?:number|no)/i,
  validate: mod97,
  generate: todoGenerate("iban"),
};
