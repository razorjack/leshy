import { Faker } from "@faker-js/faker";
import { DEFAULT_LOCALE, LOCALES, type Locale, locales } from "./locales.ts";

/**
 * Seeded Faker instances. Faker is pinned exactly (adr/0002): outputs are a
 * function of (seed, faker data), so a version bump would silently reshuffle
 * every mapping.
 */

export const fakerFor = (seed: number, locale: Locale): Faker => {
  const faker = new Faker({ locale: LOCALES[locale].chain });
  faker.seed(seed);
  return faker;
};

const hits = (text: string, markers: RegExp[]): number =>
  markers.reduce((n, re) => n + (text.match(re)?.length ?? 0), 0);

/** The locale whose markers hit `text` most often; DEFAULT_LOCALE when none do. */
export const localeFor = (text: string): Locale => {
  let best = DEFAULT_LOCALE;
  let bestHits = 0;
  for (const id of locales) {
    const markers = LOCALES[id].markers;
    if (!markers) continue;
    const n = hits(text, markers);
    if (n > bestHits) {
      best = id;
      bestHits = n;
    }
  }
  return best;
};
