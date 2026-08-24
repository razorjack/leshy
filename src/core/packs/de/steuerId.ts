import type { Generate, StructuralDetector } from "../../types.ts";
import { fakerFor } from "../../generate/faker.ts";

/**
 * German tax id (Steuer-Identifikationsnummer, IdNr): 11 digits, never starting
 * with 0, with an ISO 7064 MOD 11,10 check digit.
 */
const checkDigit = (ten: string): number => {
  let product = 10;
  for (const ch of ten) {
    const sum = (Number(ch) + product) % 10 || 10;
    product = (sum * 2) % 11;
  }
  return (11 - product) % 10;
};

/**
 * Among the first ten digits exactly one repeats — twice, or three times but
 * never consecutively. This is what makes the id far more selective than its
 * checksum alone: 0.33% of random 11-digit runs pass both.
 */
const digitsOk = (ten: string): boolean => {
  const counts = new Map<string, number>();
  for (const c of ten) counts.set(c, (counts.get(c) ?? 0) + 1);
  const repeated = [...counts.entries()].filter(([, n]) => n > 1);
  const entry = repeated[0];
  if (repeated.length !== 1 || entry === undefined) return false;
  const [d, n] = entry;
  if (n === 2) return true;
  return n === 3 && !ten.includes(d.repeat(3));
};

export const isSteuerId = (digits: string): boolean =>
  /^[1-9]\d{10}$/.test(digits) &&
  digitsOk(digits.slice(0, 10)) &&
  checkDigit(digits.slice(0, 10)) === Number(digits[10]);

/**
 * A leading zero is Leshy's fake namespace here: the checksum and the repeated
 * digit are right, so the value reads like an IdNr, but no issued one starts
 * with 0 and the detector above rejects it — re-scrubbing is a no-op without a
 * preserve rule. Digits 3-4 are held at 13–19, which is not a month in any
 * PESEL century band, so a fake can never read as a valid Polish id either.
 */
const generate: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const month = f.number.int({ min: 3, max: 9 });
  const pool = f.helpers.shuffle([2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== month)).slice(0, 6);
  const rest = f.helpers.shuffle([...pool, f.helpers.arrayElement(pool)]);
  const ten = `0${rest[0]}1${month}${rest.slice(1).join("")}`;
  return `${ten}${checkDigit(ten)}`;
};

export const steuerId: StructuralDetector = {
  id: "steuer-id",
  label: "Steuer-ID",
  type: "steuer-id",
  kind: "structural",
  enabled: true,
  match: /(?<!\d)\d{11}(?!\d)/g,
  keys: /steuer|idnr/i,
  validate: (text) => isSteuerId(text),
  generate,
};
