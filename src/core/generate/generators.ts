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
  const f = fakerFor(seed, locale);
  return { first: f.person.firstName(), last: f.person.lastName() };
};

const email: Generate = (ctx) => {
  const at = ctx.original.lastIndexOf("@");
  const localRaw = at > 0 ? ctx.original.slice(0, at) : ctx.original;
  const tokens = nameTokens(localRaw);
  let local: string;
  if (tokens) {
    // Locale from the same token sequence the person seed is: a value-derived
    // locale would hand one shared seed to two faker locales and split the
    // person from their email into two people (adr/0002 linked identities).
    const { first, last } = personParts(ctx.personSeed(tokens), ctx.localeFor(tokens.join(" ")));
    local = tokens.length > 1 ? `${first}.${last}` : first;
  } else {
    local = fakerFor(ctx.seed, "en").internet.username();
  }
  local = local.toLowerCase().replace(/[^a-z0-9._+-]/g, "") || "user";
  const domain = fakerFor(ctx.seedFor("domain"), "en").internet.domainWord();
  return `${local}@${domain}.example`;
};

// Prefix lengths of the RFC 1918 private ranges: what a fake keeps verbatim.
const PRIVATE: Array<{ re: RegExp; keep: number }> = [
  { re: /^10\./, keep: 1 },
  { re: /^172\.(?:1[6-9]|2\d|3[01])\./, keep: 2 },
  { re: /^192\.168\./, keep: 2 },
];

const ipv4: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const priv = PRIVATE.find((p) => p.re.test(ctx.original));
  if (priv) {
    const octets = ctx.original.split(".");
    return octets
      .map((o, i) => (i < priv.keep ? o : String(f.number.int({ min: 0, max: 255 }))))
      .join(".");
  }
  // Public → RFC 5737 TEST-NET (a /24 documentation block).
  const block = f.helpers.arrayElement(["192.0.2", "198.51.100", "203.0.113"]);
  return `${block}.${f.number.int({ min: 0, max: 255 })}`;
};

const ipv6: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const groups = Array.from({ length: 6 }, () =>
    f.string.hexadecimal({ length: 4, casing: "lower", prefix: "" }),
  );
  return `2001:db8:${groups.join(":")}`;
};

const mac: Generate = (ctx) => {
  const sep = ctx.original.includes("-") ? "-" : ":";
  const f = fakerFor(ctx.seed, "en");
  const hi = f.string.hexadecimal({ length: 1, casing: "upper", prefix: "" });
  // Second nibble ∈ {2,6,A,E}: locally-administered (bit 1) unicast (bit 0 clear).
  const first = `${hi}${f.helpers.arrayElement(["2", "6", "A", "E"])}`;
  const rest = Array.from({ length: 5 }, () =>
    f.string.hexadecimal({ length: 2, casing: "upper", prefix: "" }),
  );
  return [first, ...rest].join(sep);
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
const phone: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const digits = ctx.normalized.replace(/\D/g, "");
  const keep = ctx.original.trimStart().startsWith("+") ? countryCodeLength(digits) : 0;
  // One draw per position, kept or not, so the stream stays aligned across layouts.
  const fake = Array.from(digits, (d, k) => {
    const drawn = digit(f);
    return k < keep ? d : drawn;
  });
  let k = 0;
  return Array.from(ctx.original, (c) => (/\d/.test(c) ? (fake[k++] ?? c) : c)).join("");
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

const creditCard: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const chars = Array.from(ctx.original);
  const idx = chars.map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  const out = idx.map((i) => chars[i]!);
  for (let k = 1; k < out.length - 1; k++) out[k] = digit(f); // keep brand digit, hash middle
  out[out.length - 1] = luhnCheckDigit(out.slice(0, -1)); // fix the check digit
  idx.forEach((i, k) => (chars[i] = out[k]!));
  return chars.join("");
};

/** Two IBAN check digits so `country + check + bban` passes mod-97. */
const ibanCheckDigits = (country: string, bban: string): string => {
  const expanded = `${bban}${country}00`.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let r = 0;
  for (const ch of expanded) r = (r * 10 + Number(ch)) % 97;
  return String(98 - r).padStart(2, "0");
};

const iban: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const raw = ctx.original;
  const country = raw.slice(0, 2);
  const bban = Array.from(raw.slice(4), (ch) =>
    /\d/.test(ch) ? digit(f) : f.string.alpha({ length: 1, casing: "upper" }),
  ).join("");
  return `${country}${ibanCheckDigits(country, bban)}${bban}`;
};

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const jwt: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const seg = (len: number): string =>
    Array.from({ length: Math.max(len, 1) }, () => B64URL[f.number.int({ min: 0, max: 63 })]).join(
      "",
    );
  // Three base64url pseudoword segments of the source's lengths — never decodable.
  return ctx.original
    .split(".")
    .map((p) => seg(p.length))
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
const reshape = (f: Faker, src: string): string =>
  Array.from(src, (ch) => {
    if (/[0-9]/.test(ch)) return digit(f);
    if (/[A-Z]/.test(ch)) return f.string.alpha({ length: 1, casing: "upper" });
    if (/[a-z]/.test(ch)) return f.string.alpha({ length: 1, casing: "lower" });
    return ch; // preserve separators like '_' and '-'
  }).join("");

const apiKey: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const src = ctx.original;
  // Only a recognised vendor prefix survives. Anything else is opaque secret
  // material — key-context hits ('secret', 'token') have no prefix by
  // definition, and keeping their first characters leaks the real value.
  const prefix = API_PREFIXES.find((p) => src.startsWith(p)) ?? "";
  return `${prefix}${reshape(f, src.slice(prefix.length))}`;
};

// Credential material has no realistic form to imitate and no reserved
// namespace to draw from, so the fake keeps only the shape: a length or charset
// bug still reproduces on the scrubbed text. Not idempotent across passes, same
// as api-key and jwt — re-scrubbing reshapes a fake into another fake.
const secret: Generate = (ctx) => reshape(fakerFor(ctx.seed, "en"), ctx.original);

// Dates keep their layout and only the digit runs change: a four-digit run is
// the year, the first two short runs are month and day and each stays within
// 1..12, so the fake is a valid date whether the source was DD-MM or MM-DD.
// Any later short run (a two-digit year, a time) gets a value of its own width.
const dob: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  let short = 0;
  return mapDigitRuns(ctx.original, (run) => {
    if (run.length === 4) return String(f.number.int({ min: 1940, max: 2005 }));
    if (run.length === 2 && short++ < 2) return pad(f.number.int({ min: 1, max: 12 }), 2);
    return Array.from(run, () => digit(f)).join("");
  });
};

// Each decimal keeps its sign and digit counts; the integer part stays in a
// range that is a valid latitude and longitude either way.
const geo: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  return ctx.original.replace(/\d+(?:\.\d+)?/g, (num) => {
    const [int = "", frac] = num.split(".");
    const whole =
      int.length >= 3
        ? String(f.number.int({ min: 100, max: 179 }))
        : int.length === 2
          ? String(f.number.int({ min: 10, max: 89 }))
          : String(f.number.int({ min: 0, max: 9 }));
    return frac === undefined ? whole : `${whole}.${Array.from(frac, () => digit(f)).join("")}`;
  });
};

const cardCode: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  return mapDigitRuns(ctx.original, (run) => Array.from(run, () => digit(f)).join(""));
};

// MM/YY, MM/YYYY, YYYY-MM: the month run is the first two-digit run, the year
// is the four-digit run or the remaining two-digit one, always in the future.
const cardExpiry: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  let seenMonth = false;
  return mapDigitRuns(ctx.original, (run) => {
    if (run.length === 4) return String(f.number.int({ min: 2027, max: 2033 }));
    if (run.length === 2 && !seenMonth) {
      seenMonth = true;
      return pad(f.number.int({ min: 1, max: 12 }), 2);
    }
    if (run.length === 2) return String(f.number.int({ min: 27, max: 33 }));
    return Array.from(run, () => digit(f)).join("");
  });
};

const uuid: Generate = (ctx) => fakerFor(ctx.seed, "en").string.uuid();

/** Reproduce the source word's casing on a faked word. */
const matchCase = (fake: string, src: string): string => {
  if (src.length > 0 && src === src.toUpperCase() && src !== src.toLowerCase()) {
    return fake.toUpperCase();
  }
  if (src === src.toLowerCase()) return fake.toLowerCase();
  return fake; // Titlecase / mixed → faker's default titlecase
};

const person: Generate = (ctx) => {
  const tokens = nameTokens(ctx.original) ?? [ctx.normalized];
  const locale = ctx.localeFor(tokens.join(" ")); // see email: linkage, not value
  const { first, last } = personParts(ctx.personSeed(tokens), locale); // links to email
  const words = ctx.original.split(/\s+/).filter(Boolean);
  let names: string[];
  if (words.length <= 1) names = [first];
  else if (words.length === 2) names = [first, last];
  else {
    const mids = Array.from({ length: words.length - 2 }, (_, k) =>
      fakerFor(ctx.seedFor(`mid:${k}`), locale).person.firstName(),
    );
    names = [first, ...mids, last];
  }
  return names.map((n, i) => matchCase(n, words[i] ?? "")).join(" ");
};

const address: Generate = (ctx) => {
  const locale = ctx.localeFor();
  const f = fakerFor(ctx.seed, locale);
  switch (LOCALES[locale].addressOrder) {
    case "city-state-zip":
      return `${f.location.streetAddress()}, ${f.location.city()}, ${f.location.state({ abbreviated: true })} ${f.location.zipCode()}`;
    case "city-zip":
      return `${f.location.streetAddress()}, ${f.location.city()} ${f.location.zipCode()}`;
    default:
      return `${f.location.streetAddress()}, ${f.location.zipCode()} ${f.location.city()}`;
  }
};

const street: Generate = (ctx) => fakerFor(ctx.seed, ctx.localeFor()).location.streetAddress();

const city: Generate = (ctx) => fakerFor(ctx.seed, ctx.localeFor()).location.city();

// A postal code is a formatted code, not prose. Swapping digit for digit and
// letter for letter keeps every country's shape (00-624, SW1A 1AA, 97477-1234)
// without having to know which country it belongs to.
const postcode: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  return Array.from(ctx.original, (ch) => {
    if (/\d/.test(ch)) return digit(f);
    if (!/\p{L}/u.test(ch)) return ch;
    return f.string.alpha({ length: 1, casing: ch === ch.toLowerCase() ? "lower" : "upper" });
  }).join("");
};

// Legal company forms whose locale Leshy does not generate in yet: still worth
// recognising, since the suffix is kept verbatim rather than generated.
const EXTRA_SUFFIXES = ["Oy", "A/S", "ApS", "d.o.o."];

// A suffix is written the way a human writes it; the pattern tolerates the
// spacing and dropped dots that show up in real data ("Sp.z o.o", "Inc").
const pattern = (suffix: string): string => suffix.replaceAll(".", "\\.?").replaceAll(" ", "\\s*");

const SUFFIXES = [
  ...new Set([...locales.flatMap((l) => LOCALES[l].orgSuffixes ?? []), ...EXTRA_SUFFIXES]),
]
  .sort((a, b) => b.length - a.length)
  .map(pattern);

// Legal suffixes kept verbatim; only the company name is faked (adr/0002).
const ORG_SUFFIX = new RegExp(`\\s+(${SUFFIXES.join("|")})\\s*$`, "i");
// Faker often appends its own suffix; strip it so we don't double up.
const FAKER_SUFFIX = new RegExp(
  `[,\\s]+(?:${[...SUFFIXES, "z\\s*o\\.?\\s*o\\.?", "Group", "and\\s+Sons"].join("|")})\\s*$`,
  "i",
);

const org: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, ctx.localeFor());
  const m = ctx.original.match(ORG_SUFFIX);
  const suffix = m ? m[1] : "";
  const base = f.company.name().replace(FAKER_SUFFIX, "").trim() || f.person.lastName();
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
  dob,
  geo,
  "card-code": cardCode,
  "card-expiry": cardExpiry,
  person,
  address,
  street,
  city,
  postcode,
  org,
} satisfies Record<string, Generate>;
