import type { Generate } from "../types.ts";
import { fakerFor } from "./faker.ts";
import { LOCALES, type Locale, locales } from "./locales.ts";
import { nameTokens } from "./derive.ts";
import { digit } from "./shape.ts";

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

// E.164 country codes are 1–3 digits. Separator-less numbers ("+14155552671")
// give the layout no boundary to stop at, so cap the run: without the cap the
// whole number counts as country code and the fake reproduces the source.
const MAX_COUNTRY_CODE_DIGITS = 3;

const phone: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const chars = Array.from(ctx.original);
  // Keep the country-code digit run right after a leading '+'; the layout
  // (spaces, dashes, parens) survives because only digit chars are swapped.
  const keep = new Set<number>();
  const plus = ctx.original.indexOf("+");
  if (plus >= 0) {
    const limit = Math.min(chars.length, plus + 1 + MAX_COUNTRY_CODE_DIGITS);
    for (let i = plus + 1; i < limit && /\d/.test(chars[i]!); i++) keep.add(i);
  }
  return chars.map((c, i) => (/\d/.test(c) && !keep.has(i) ? digit(f) : c)).join("");
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

const apiKey: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const src = ctx.original;
  // Only a recognised vendor prefix survives. Anything else is opaque secret
  // material — key-context hits ('secret', 'token') have no prefix by
  // definition, and keeping their first characters leaks the real value.
  const prefix = API_PREFIXES.find((p) => src.startsWith(p)) ?? "";
  const tail = Array.from(src.slice(prefix.length), (ch) => {
    if (/[0-9]/.test(ch)) return digit(f);
    if (/[A-Z]/.test(ch)) return f.string.alpha({ length: 1, casing: "upper" });
    if (/[a-z]/.test(ch)) return f.string.alpha({ length: 1, casing: "lower" });
    return ch; // preserve separators like '_' and '-'
  }).join("");
  return `${prefix}${tail}`;
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
  uuid,
  person,
  address,
  street,
  city,
  postcode,
  org,
} satisfies Record<string, Generate>;
