import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

const luhn = (digits: string): boolean => {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
};

export const creditCard: StructuralDetector = {
  id: "credit-card",
  label: "Card number",
  type: "credit-card",
  kind: "structural",
  enabled: true,
  match: /(?<![\d.-])\d(?:[ -]?\d){12,18}(?![\d.-])/g,
  keys: /card_?(?:number|num|no)|^pan$/i,
  validate: (text) => {
    const digits = text.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && /^[2-6]/.test(digits) && luhn(digits);
  },
  generate: generators["credit-card"],
};
