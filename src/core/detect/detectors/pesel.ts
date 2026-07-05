import type { StructuralDetector } from "../../types.ts";
import { todoGenerate } from "../../generate/todo.ts";

const CHECKSUM_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

export const peselChecksum = (digits: string): boolean => {
  const sum = CHECKSUM_WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[10]);
};

// PESEL encodes the birth century in the month field:
//   +0 → 1900s, +20 → 2000s, +40 → 2100s, +60 → 2200s, +80 → 1800s.
// Real people have 1800–2099 months; Leshy generates fakes in the 2100s band
// (month 41–52) so its own output is recognisable and never re-scrubbed.
export const peselMonth = (digits: string): number => Number(digits.slice(2, 4));

export const isFakePesel = (digits: string): boolean => {
  const m = peselMonth(digits);
  return peselChecksum(digits) && m >= 41 && m <= 72;
};

const dateValid = (digits: string): boolean => {
  const m = peselMonth(digits) % 20;
  const day = Number(digits.slice(4, 6));
  const century = Math.floor(peselMonth(digits) / 20);
  if (century === 2 || century === 3) return false; // 2100s/2200s: Leshy's fake band
  if (m < 1 || m > 12) return false;
  return day >= 1 && day <= 31;
};

export const pesel: StructuralDetector = {
  id: "pesel",
  label: "PESEL",
  type: "pesel",
  kind: "structural",
  enabled: true,
  match: /(?<!\d)\d{11}(?!\d)/g,
  keys: /^pesel$/i,
  validate: (text) => peselChecksum(text) && dateValid(text),
  generate: todoGenerate("pesel"),
};
