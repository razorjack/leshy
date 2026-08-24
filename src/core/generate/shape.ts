import type { Faker } from "@faker-js/faker";

/** Shape helpers shared by the generators, including the ones inside packs. */

export const pad = (n: number, width: number): string => String(n).padStart(width, "0");

export const digit = (f: Faker): string => String(f.number.int({ min: 0, max: 9 }));
