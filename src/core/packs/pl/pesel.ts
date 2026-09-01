import type { Generate, StructuralDetector } from "../../types.ts";
import { fakerFor } from "../../generate/faker.ts";
import { pad } from "../../generate/shape.ts";

const CHECKSUM_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

export const peselChecksum = (digits: string): boolean => {
  const sum = CHECKSUM_WEIGHTS.reduce(
    (total, weight, index) => total + weight * Number(digits[index]),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(digits[10]);
};

// PESEL encodes the birth century in the month field:
//   +0 → 1900s, +20 → 2000s, +40 → 2100s, +60 → 2200s, +80 → 1800s.
// Real people have 1800–2099 months; Leshy generates fakes in the 2100s band
// (month 41–52) so its own output is recognisable and never re-scrubbed.
export const peselMonth = (digits: string): number => Number(digits.slice(2, 4));

export const isFakePesel = (digits: string): boolean => {
  const month = peselMonth(digits);
  return peselChecksum(digits) && month >= 41 && month <= 72;
};

const dateValid = (digits: string): boolean => {
  const month = peselMonth(digits) % 20;
  const day = Number(digits.slice(4, 6));
  const century = Math.floor(peselMonth(digits) / 20);
  if (century === 2 || century === 3) return false; // 2100s/2200s: Leshy's fake band
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= 31;
};

const generate: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  const year = pad(faker.number.int({ min: 0, max: 99 }), 2);
  // Month +40 → 2100s century band (41–52): checksum-valid, humanly impossible.
  const month = pad(faker.number.int({ min: 1, max: 12 }) + 40, 2);
  const day = pad(faker.number.int({ min: 1, max: 28 }), 2);
  const serial = Array.from({ length: 3 }, () => faker.number.int({ min: 0, max: 9 })).join("");
  let sex = faker.number.int({ min: 0, max: 9 });
  const sourceSex = Number(context.normalized[9]);
  // Keep the encoded sex (parity of the 10th digit); `^1` flips parity in 0–9.
  if (Number.isFinite(sourceSex) && sex % 2 !== sourceSex % 2) sex ^= 1;
  const firstTenDigits = `${year}${month}${day}${serial}${sex}`;
  const sum = CHECKSUM_WEIGHTS.reduce(
    (total, weight, index) => total + weight * Number(firstTenDigits[index]),
    0,
  );
  return `${firstTenDigits}${(10 - (sum % 10)) % 10}`;
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
  generate,
};
