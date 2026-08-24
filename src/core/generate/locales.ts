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
/**
 * How a full postal address is laid out: `street, 00-001 City` across most of
 * Europe, `street, City, ST 12345` in the US, `street, City AB12 3CD` in the UK.
 */
export type AddressOrder = "zip-city" | "city-state-zip" | "city-zip";

export interface LocaleSpec {
  label: string;
  /** Faker fallback chain, most specific first. */
  chain: LocaleDefinition[];
  markers?: RegExp[];
  /** Defaults to "zip-city", the most common layout. */
  addressOrder?: AddressOrder;
  /** Legal company suffixes. Kept verbatim on an org fake, whatever the locale
   * generating it: `Société Générale SA` keeps its `SA` in an `en` document. */
  orgSuffixes?: string[];
}

const table = {
  en: {
    label: "English",
    chain: [en, base],
    addressOrder: "city-state-zip",
    orgSuffixes: ["Inc.", "LLC", "LLP", "Ltd.", "Corp.", "Co.", "PLC", "Pty Ltd."],
  },
  en_GB: {
    label: "English (UK)",
    chain: [en_GB, en, base],
    addressOrder: "city-zip",
    orgSuffixes: ["Ltd.", "PLC", "LLP"],
  },
  cs_CZ: { label: "Czech", chain: [cs_CZ, en, base], orgSuffixes: ["s.r.o.", "a.s."] },
  de: {
    label: "German",
    chain: [de, en, base],
    // Umlauts/eszett, a compound street name, or a legal form.
    markers: [/[äöüßÄÖÜ]/g, /\p{Lu}[\p{L}-]*(?:stra(?:ß|ss)e|str\.)/gu, /\bGmbH\b/g],
    orgSuffixes: ["GmbH", "AG", "KG", "e.V."],
  },
  es: { label: "Spanish", chain: [es, en, base], orgSuffixes: ["S.A.", "S.L.", "S.L.U."] },
  fr: { label: "French", chain: [fr, en, base], orgSuffixes: ["SAS", "SARL", "SNC"] },
  it: { label: "Italian", chain: [it, en, base], orgSuffixes: ["S.p.A.", "S.r.l."] },
  nl: { label: "Dutch", chain: [nl, en, base], orgSuffixes: ["B.V.", "N.V."] },
  pl: {
    label: "Polish",
    chain: [pl, en, base],
    // Diacritics, street prefixes, or a `DD-DDD` postcode.
    markers: [/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, /\b(?:ul|al|os|pl)\./g, /\b\d{2}-\d{3}\b/g],
    orgSuffixes: ["Sp. z o.o.", "S.A.", "Sp. j.", "Sp. k.", "S.K.A."],
  },
  pt_BR: {
    label: "Portuguese (Brazil)",
    chain: [pt_BR, en, base],
    addressOrder: "city-state-zip",
    orgSuffixes: ["Ltda.", "S.A."],
  },
  sv: { label: "Swedish", chain: [sv, en, base], orgSuffixes: ["AB", "HB", "KB"] },
} satisfies Record<string, LocaleSpec>;

export type Locale = keyof typeof table;

/** Widened so every entry reads uniformly, with the literal keys preserved. */
export const LOCALES: Record<Locale, LocaleSpec> = table;

/** Declaration order — also the tie-break when two locales score equally. */
export const locales = Object.keys(LOCALES) as Locale[];

/** Used when nothing in the text points anywhere else. */
export const DEFAULT_LOCALE: Locale = "en";
