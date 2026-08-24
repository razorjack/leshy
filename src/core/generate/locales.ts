import {
  base,
  cs_CZ,
  de,
  en,
  en_GB,
  es,
  fr,
  it,
  type LocaleDefinition,
  nl,
  pl,
  pt_BR,
  sv,
} from "@faker-js/faker";

/**
 * The locales Leshy generates in. Latin script only: the email generator strips
 * a local part down to [a-z0-9._+-], so a Cyrillic or CJK name would collapse
 * to `user@…` instead of a plausible address.
 *
 * `markers` drive `locale: 'auto'` — the locale whose markers hit the text most
 * often wins, and a tie goes to the one declared first. A locale with no
 * markers is reachable only by naming it in the config, which is the point:
 * adding a marker set is what makes a locale detectable, not a code change.
 */
export interface LocaleSpec {
  label: string;
  /** Faker fallback chain, most specific first. */
  chain: LocaleDefinition[];
  markers?: RegExp[];
}

const table = {
  en: { label: "English", chain: [en, base] },
  en_GB: { label: "English (UK)", chain: [en_GB, en, base] },
  cs_CZ: { label: "Czech", chain: [cs_CZ, en, base] },
  de: { label: "German", chain: [de, en, base] },
  es: { label: "Spanish", chain: [es, en, base] },
  fr: { label: "French", chain: [fr, en, base] },
  it: { label: "Italian", chain: [it, en, base] },
  nl: { label: "Dutch", chain: [nl, en, base] },
  pl: {
    label: "Polish",
    chain: [pl, en, base],
    // Diacritics, street prefixes, or a `DD-DDD` postcode.
    markers: [/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, /\b(?:ul|al|os|pl)\./g, /\b\d{2}-\d{3}\b/g],
  },
  pt_BR: { label: "Portuguese (Brazil)", chain: [pt_BR, en, base] },
  sv: { label: "Swedish", chain: [sv, en, base] },
} satisfies Record<string, LocaleSpec>;

export type Locale = keyof typeof table;

/** Widened so every entry reads uniformly, with the literal keys preserved. */
export const LOCALES: Record<Locale, LocaleSpec> = table;

/** Declaration order — also the tie-break when two locales score equally. */
export const locales = Object.keys(LOCALES) as Locale[];

/** Used when nothing in the text points anywhere else. */
export const DEFAULT_LOCALE: Locale = "en";
