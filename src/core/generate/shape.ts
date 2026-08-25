import type { Faker } from "@faker-js/faker";

/** Shape helpers shared by the generators, including the ones inside packs. */

export const pad = (n: number, width: number): string => String(n).padStart(width, "0");

export const digit = (f: Faker): string => String(f.number.int({ min: 0, max: 9 }));

/** Replace every run of digits in `src`; `fn` sees the run and its ordinal. */
export const mapDigitRuns = (src: string, fn: (run: string, index: number) => string): string => {
  let i = 0;
  return src.replace(/\d+/g, (run) => fn(run, i++));
};
