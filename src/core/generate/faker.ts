import { base, en, Faker, pl } from "@faker-js/faker";

/**
 * Seeded Faker instances for the two locales Leshy generates in. Faker is
 * pinned exactly (adr/0002): outputs are a function of (seed, faker data), so a
 * version bump would silently reshuffle every mapping.
 */

export type Locale = "pl" | "en";

export const fakerFor = (seed: number, locale: Locale): Faker => {
  const faker = new Faker({ locale: locale === "pl" ? [pl, en, base] : [en, base] });
  faker.seed(seed);
  return faker;
};

const PL_DIACRITICS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
// Polish street prefixes or a `DD-DDD` postcode mark a Polish-address context.
const PL_ADDRESS = /\b(?:ul|al|os|pl)\.|\b\d{2}-\d{3}\b/;

/** Polish diacritics in the value, or a Polish-address-shaped context ⇒ pl. */
export const localeFor = (value: string, context: string = value): Locale =>
  PL_DIACRITICS.test(value) || PL_ADDRESS.test(context) ? "pl" : "en";
