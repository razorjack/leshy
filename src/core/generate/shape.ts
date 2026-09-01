import type { Faker } from "@faker-js/faker";

/** Shape helpers shared by the generators, including the ones inside packs. */

export const pad = (number: number, width: number): string => String(number).padStart(width, "0");

export const digit = (faker: Faker): string => String(faker.number.int({ min: 0, max: 9 }));

/** Replace every run of digits in `source`; `replaceRun` sees the run and its ordinal. */
export const mapDigitRuns = (
  source: string,
  replaceRun: (run: string, index: number) => string,
): string => {
  let runIndex = 0;
  return source.replace(/\d+/g, (run) => replaceRun(run, runIndex++));
};
