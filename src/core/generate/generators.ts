import type { Faker } from "@faker-js/faker";
import type { Generate } from "../types.ts";
import { fakerFor } from "./faker.ts";
import { LOCALES, type Locale, locales } from "./locales.ts";
import { nameTokens } from "./derive.ts";
import { digit, mapDigitRuns, pad } from "./shape.ts";

/**
 * Per-type fake generators (docs/adr/0002 table). Each is a pure function of its
 * GenerateContext. Structured types (email, ip, mac, ssn, pesel) draw from
 * reserved namespaces no real value occupies, so re-scrubbing is a no-op; the
 * shape-preserving digit types and semantic types land in steps 4–5.
 *
 * Output must never contain quotes, backslashes or newlines — the engine
 * reseeds on violation (adr/0002).
 */

/** first/last name for a seed. Shared by person (step 5) and email linkage so
 * `Jan Kowalski` and `jan.kowalski@…` derive one identity (adr/0002). */
export interface PersonParts {
  first: string;
  last: string;
}
export const personParts = (seed: number, locale: Locale): PersonParts => {
  const faker = fakerFor(seed, locale);
  return { first: faker.person.firstName(), last: faker.person.lastName() };
};

const email: Generate = (context) => {
  const at = context.original.lastIndexOf("@");
  const sourceLocalPart = at > 0 ? context.original.slice(0, at) : context.original;
  const tokens = nameTokens(sourceLocalPart);
  let local: string;
  if (tokens) {
    // Locale from the same token sequence the person seed is: a value-derived
    // locale would hand one shared seed to two faker locales and split the
    // person from their email into two people (adr/0002 linked identities).
    const { first, last } = personParts(
      context.personSeed(tokens),
      context.localeFor(tokens.join(" ")),
    );
    local = tokens.length > 1 ? `${first}.${last}` : first;
  } else {
    local = fakerFor(context.seed, "en").internet.username();
  }
  local = local.toLowerCase().replace(/[^a-z0-9._+-]/g, "") || "user";
  const domain = fakerFor(context.seedFor("domain"), "en").internet.domainWord();
  return `${local}@${domain}.example`;
};

// Prefix lengths of the RFC 1918 private ranges: what a fake keeps verbatim.
const PRIVATE: Array<{ pattern: RegExp; keep: number }> = [
  { pattern: /^10\./, keep: 1 },
  { pattern: /^172\.(?:1[6-9]|2\d|3[01])\./, keep: 2 },
  { pattern: /^192\.168\./, keep: 2 },
];

const ipv4: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  const privateRange = PRIVATE.find((range) => range.pattern.test(context.original));
  if (privateRange) {
    const octets = context.original.split(".");
    return octets
      .map((octet, index) => {
        if (index < privateRange.keep) return octet;
        return String(faker.number.int({ min: 0, max: 255 }));
      })
      .join(".");
  }
  // Public → RFC 5737 TEST-NET (a /24 documentation block).
  const block = faker.helpers.arrayElement(["192.0.2", "198.51.100", "203.0.113"]);
  return `${block}.${faker.number.int({ min: 0, max: 255 })}`;
};

const ipv6: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  const groups = Array.from({ length: 6 }, () =>
    faker.string.hexadecimal({ length: 4, casing: "lower", prefix: "" }),
  );
  return `2001:db8:${groups.join(":")}`;
};

const mac: Generate = (context) => {
  const separator = context.original.includes("-") ? "-" : ":";
  const faker = fakerFor(context.seed, "en");
  const highNibble = faker.string.hexadecimal({ length: 1, casing: "upper", prefix: "" });
  // Second nibble ∈ {2,6,A,E}: locally-administered (bit 1) unicast (bit 0 clear).
  const first = `${highNibble}${faker.helpers.arrayElement(["2", "6", "A", "E"])}`;
  const rest = Array.from({ length: 5 }, () =>
    faker.string.hexadecimal({ length: 2, casing: "upper", prefix: "" }),
  );
  return [first, ...rest].join(separator);
};

// E.164 country codes are prefix-free: zones 1 and 7 are one digit, and among
// the rest these are the two-digit codes; every other code is three digits.
const TWO_DIGIT_CC = new Set(
  "20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98".split(
    " ",
  ),
);

const countryCodeLength = (digits: string): number => {
  if (digits.startsWith("1") || digits.startsWith("7")) return 1;
  return TWO_DIGIT_CC.has(digits.slice(0, 2)) ? 2 : 3;
};

// The fake is a function of the digit sequence, not of its layout: draw one
// digit per source digit, keep the country code after a leading '+', then lay
// the result into the source's separators. "+48 601 234 567", "+48601234567"
// and "48 601 234 567" are one identity and must read as one fake.
const phone: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  const digits = context.normalized.replace(/\D/g, "");
  const keptDigits = context.original.trimStart().startsWith("+") ? countryCodeLength(digits) : 0;
  // One draw per position, kept or not, so the stream stays aligned across layouts.
  const fakeDigits = Array.from(digits, (sourceDigit, index) => {
    const drawnDigit = digit(faker);
    return index < keptDigits ? sourceDigit : drawnDigit;
  });
  let digitIndex = 0;
  return Array.from(context.original, (character) => {
    if (!/\d/.test(character)) return character;
    return fakeDigits[digitIndex++] ?? character;
  }).join("");
};

/** Luhn check digit for a digit prefix (the appended digit sits un-doubled). */
const luhnCheckDigit = (prefix: string[]): string => {
  let sum = 0;
  let alt = true;
  for (let i = prefix.length - 1; i >= 0; i--) {
    let d = Number(prefix[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return String((10 - (sum % 10)) % 10);
};

const creditCard: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  const characters = Array.from(context.original);
  const digitPositions = characters
    .map((character, index) => (/\d/.test(character) ? index : -1))
    .filter((index) => index >= 0);
  const fakeDigits = digitPositions.map((index) => characters[index]!);

  for (let index = 1; index < fakeDigits.length - 1; index++) {
    fakeDigits[index] = digit(faker);
  }
  fakeDigits[fakeDigits.length - 1] = luhnCheckDigit(fakeDigits.slice(0, -1));
  digitPositions.forEach((position, index) => {
    characters[position] = fakeDigits[index]!;
  });
  return characters.join("");
};

/** Two IBAN check digits so `country + check + bban` passes mod-97. */
const ibanCheckDigits = (country: string, bban: string): string => {
  const expanded = `${bban}${country}00`.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const character of expanded) {
    remainder = (remainder * 10 + Number(character)) % 97;
  }
  return String(98 - remainder).padStart(2, "0");
};

const iban: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  const country = context.original.slice(0, 2);
  const bban = Array.from(context.original.slice(4), (character) =>
    /\d/.test(character) ? digit(faker) : faker.string.alpha({ length: 1, casing: "upper" }),
  ).join("");
  return `${country}${ibanCheckDigits(country, bban)}${bban}`;
};

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const jwt: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  const fakeSegment = (length: number): string =>
    Array.from(
      { length: Math.max(length, 1) },
      () => B64URL[faker.number.int({ min: 0, max: 63 })],
    ).join("");
  // Three base64url pseudoword segments of the source's lengths — never decodable.
  return context.original
    .split(".")
    .map((segment) => fakeSegment(segment.length))
    .join(".");
};

// Known secret prefixes (mirrors api-key detector) kept verbatim on the fake.
const API_PREFIXES = [
  "github_pat_",
  "sk_live_",
  "pk_live_",
  "whsec_",
  "ghp_",
  "gho_",
  "xoxb-",
  "xoxp-",
  "xoxa-",
  "xoxr-",
  "xoxs-",
  "AKIA",
  "ASIA",
  "AIza",
  "sk-",
];

/** Same length, same character classes, same separators, none of the bytes. */
const reshape = (faker: Faker, source: string): string =>
  Array.from(source, (character) => {
    if (/[0-9]/.test(character)) return digit(faker);
    if (/[A-Z]/.test(character)) {
      return faker.string.alpha({ length: 1, casing: "upper" });
    }
    if (/[a-z]/.test(character)) {
      return faker.string.alpha({ length: 1, casing: "lower" });
    }
    return character; // preserve separators like '_' and '-'
  }).join("");

const apiKey: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  const source = context.original;
  // Only a recognised vendor prefix survives. Anything else is opaque secret
  // material — key-context hits ('secret', 'token') have no prefix by
  // definition, and keeping their first characters leaks the real value.
  const prefix = API_PREFIXES.find((candidate) => source.startsWith(candidate)) ?? "";
  return `${prefix}${reshape(faker, source.slice(prefix.length))}`;
};

// Credential material has no realistic form to imitate and no reserved
// namespace to draw from, so the fake keeps only the shape: a length or charset
// bug still reproduces on the scrubbed text. Not idempotent across passes, same
// as api-key and jwt — re-scrubbing reshapes a fake into another fake.
const secret: Generate = (context) => reshape(fakerFor(context.seed, "en"), context.original);

// Dates keep their layout and only the digit runs change: a four-digit run is
// the year, the first two short runs are month and day and each stays within
// 1..12, so the fake is a valid date whether the source was DD-MM or MM-DD.
// Any later short run (a two-digit year, a time) gets a value of its own width.
const dob: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  let shortRunCount = 0;
  return mapDigitRuns(context.original, (run) => {
    if (run.length === 4) return String(faker.number.int({ min: 1940, max: 2005 }));
    if (run.length === 2 && shortRunCount++ < 2) {
      return pad(faker.number.int({ min: 1, max: 12 }), 2);
    }
    return Array.from(run, () => digit(faker)).join("");
  });
};

// Each decimal keeps its sign and digit counts; the integer part stays in a
// range that is a valid latitude and longitude either way.
const coordinateWhole = (faker: Faker, length: number): string => {
  if (length >= 3) return String(faker.number.int({ min: 100, max: 179 }));
  if (length === 2) return String(faker.number.int({ min: 10, max: 89 }));
  return String(faker.number.int({ min: 0, max: 9 }));
};

const geo: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  return context.original.replace(/\d+(?:\.\d+)?/g, (decimal) => {
    const [integer = "", fraction] = decimal.split(".");
    const whole = coordinateWhole(faker, integer.length);
    if (fraction === undefined) return whole;

    const fakeFraction = Array.from(fraction, () => digit(faker)).join("");
    return `${whole}.${fakeFraction}`;
  });
};

const cardCode: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  return mapDigitRuns(context.original, (run) => Array.from(run, () => digit(faker)).join(""));
};

// MM/YY, MM/YYYY, YYYY-MM: the month run is the first two-digit run, the year
// is the four-digit run or the remaining two-digit one, always in the future.
const cardExpiry: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  let seenMonth = false;
  return mapDigitRuns(context.original, (run) => {
    if (run.length === 4) return String(faker.number.int({ min: 2027, max: 2033 }));
    if (run.length === 2 && !seenMonth) {
      seenMonth = true;
      return pad(faker.number.int({ min: 1, max: 12 }), 2);
    }
    if (run.length === 2) return String(faker.number.int({ min: 27, max: 33 }));
    return Array.from(run, () => digit(faker)).join("");
  });
};

// One fake label per source label under the reserved `.example` TLD, so the
// depth survives and a re-scrub recognises the result. A port stays.
const hostname: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  const [host = "", ...portParts] = context.original.split(":");
  const labels = host.split(".").filter(Boolean);
  const fakeLabels = labels
    .slice(0, Math.max(labels.length - 1, 1))
    .map(() => faker.internet.domainWord());
  return [`${fakeLabels.join(".")}.example`, ...portParts].join(":");
};

const uuid: Generate = (context) => fakerFor(context.seed, "en").string.uuid();

/** Reproduce the source word's casing on a faked word. */
const matchCase = (fake: string, source: string): string => {
  if (source.length > 0 && source === source.toUpperCase() && source !== source.toLowerCase()) {
    return fake.toUpperCase();
  }
  if (source === source.toLowerCase()) return fake.toLowerCase();
  return fake; // Titlecase / mixed → faker's default titlecase
};

const person: Generate = (context) => {
  const tokens = nameTokens(context.original) ?? [context.normalized];
  const locale = context.localeFor(tokens.join(" ")); // see email: linkage, not value
  const { first, last } = personParts(context.personSeed(tokens), locale); // links to email
  const words = context.original.split(/\s+/).filter(Boolean);
  let names: string[];
  if (words.length <= 1) {
    names = [first];
  } else if (words.length === 2) {
    names = [first, last];
  } else {
    const middleNames = Array.from({ length: words.length - 2 }, (_, index) =>
      fakerFor(context.seedFor(`mid:${index}`), locale).person.firstName(),
    );
    names = [first, ...middleNames, last];
  }
  return names.map((name, index) => matchCase(name, words[index] ?? "")).join(" ");
};

// A login links to the person the same way an email local part does, keeps
// the source's separator style and its trailing digits (reshaped), and stays
// within the charset logins are made of.
const username: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  const tokens = nameTokens(context.original);
  let name: string;
  if (tokens) {
    const { first, last } = personParts(
      context.personSeed(tokens),
      context.localeFor(tokens.join(" ")),
    );
    const separator = context.original.match(/[._-]/)?.[0] ?? "";
    name = tokens.length > 1 ? `${first}${separator}${last}` : first;
  } else {
    name = faker.internet.username();
  }
  const sourceDigits = context.original.match(/\d+$/)?.[0] ?? "";
  const fakeDigits = Array.from(sourceDigits, () => digit(faker)).join("");
  const safeName = matchCase(name, context.original).replace(/[^A-Za-z0-9._-]/g, "");
  return `${safeName || "user"}${fakeDigits}`;
};

const address: Generate = (context) => {
  const locale = context.localeFor();
  const faker = fakerFor(context.seed, locale);
  switch (LOCALES[locale].addressOrder) {
    case "city-state-zip":
      return `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode()}`;
    case "city-zip":
      return `${faker.location.streetAddress()}, ${faker.location.city()} ${faker.location.zipCode()}`;
    default:
      return `${faker.location.streetAddress()}, ${faker.location.zipCode()} ${faker.location.city()}`;
  }
};

const street: Generate = (context) =>
  fakerFor(context.seed, context.localeFor()).location.streetAddress();

const city: Generate = (context) => fakerFor(context.seed, context.localeFor()).location.city();

// A postal code is a formatted code, not prose. Swapping digit for digit and
// letter for letter keeps every country's shape (00-624, SW1A 1AA, 97477-1234)
// without having to know which country it belongs to.
const postcode: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  return Array.from(context.original, (character) => {
    if (/\d/.test(character)) return digit(faker);
    if (!/\p{L}/u.test(character)) return character;
    const casing = character === character.toLowerCase() ? "lower" : "upper";
    return faker.string.alpha({ length: 1, casing });
  }).join("");
};

// Legal company forms whose locale Leshy does not generate in yet: still worth
// recognising, since the suffix is kept verbatim rather than generated.
const EXTRA_SUFFIXES = ["Oy", "A/S", "ApS", "d.o.o."];

// A suffix is written the way a human writes it; the pattern tolerates the
// spacing and dropped dots that show up in real data ("Sp.z o.o", "Inc").
const pattern = (suffix: string): string => suffix.replaceAll(".", "\\.?").replaceAll(" ", "\\s*");

const SUFFIXES = [
  ...new Set([
    ...locales.flatMap((locale) => LOCALES[locale].orgSuffixes ?? []),
    ...EXTRA_SUFFIXES,
  ]),
]
  .sort((left, right) => right.length - left.length)
  .map(pattern);

// Legal suffixes kept verbatim; only the company name is faked (adr/0002).
const ORG_SUFFIX = new RegExp(`\\s+(${SUFFIXES.join("|")})\\s*$`, "i");
// Faker often appends its own suffix; strip it so we don't double up.
const FAKER_SUFFIX = new RegExp(
  `[,\\s]+(?:${[...SUFFIXES, "z\\s*o\\.?\\s*o\\.?", "Group", "and\\s+Sons"].join("|")})\\s*$`,
  "i",
);

const org: Generate = (context) => {
  const faker = fakerFor(context.seed, context.localeFor());
  const suffixMatch = context.original.match(ORG_SUFFIX);
  const suffix = suffixMatch?.[1] ?? "";
  const base = faker.company.name().replace(FAKER_SUFFIX, "").trim() || faker.person.lastName();
  return suffix ? `${base} ${suffix}` : base;
};

export const generators = {
  email,
  ipv4,
  ipv6,
  mac,
  phone,
  "credit-card": creditCard,
  iban,
  jwt,
  "api-key": apiKey,
  secret,
  uuid,
  hostname,
  dob,
  geo,
  "card-code": cardCode,
  "card-expiry": cardExpiry,
  person,
  username,
  address,
  street,
  city,
  postcode,
  org,
} satisfies Record<string, Generate>;
