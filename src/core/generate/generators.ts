import type { Generate } from "../types.ts";
import { fakerFor, type Locale } from "./faker.ts";
import { nameTokens } from "./derive.ts";

/**
 * Per-type fake generators (docs/adr/0002 table). Each is a pure function of its
 * GenerateContext. Structured types (email, ip, mac, ssn, pesel) draw from
 * reserved namespaces no real value occupies, so re-scrubbing is a no-op; the
 * shape-preserving digit types and semantic types land in steps 4–5.
 *
 * Output must never contain quotes, backslashes or newlines — the engine
 * reseeds on violation (adr/0002).
 */

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

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
    const { first, last } = personParts(ctx.personSeed(tokens), "en");
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

const ssn: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  let area = f.number.int({ min: 1, max: 899 });
  if (area === 666) area = 665;
  const serial = f.number.int({ min: 1, max: 9999 });
  // Group "00" is never issued — Leshy's SSN fake namespace.
  return `${pad(area, 3)}-00-${pad(serial, 4)}`;
};

const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

const pesel: Generate = (ctx) => {
  const f = fakerFor(ctx.seed, "en");
  const yy = pad(f.number.int({ min: 0, max: 99 }), 2);
  // Month +40 → 2100s century band (41–52): checksum-valid, humanly impossible.
  const mm = pad(f.number.int({ min: 1, max: 12 }) + 40, 2);
  const dd = pad(f.number.int({ min: 1, max: 28 }), 2);
  const s = `${f.number.int({ min: 0, max: 9 })}${f.number.int({ min: 0, max: 9 })}${f.number.int({ min: 0, max: 9 })}`;
  let sex = f.number.int({ min: 0, max: 9 });
  const srcSex = Number(ctx.normalized[9]);
  // Keep the encoded sex (parity of the 10th digit); `^1` flips parity in 0–9.
  if (Number.isFinite(srcSex) && sex % 2 !== srcSex % 2) sex ^= 1;
  const ten = `${yy}${mm}${dd}${s}${sex}`;
  const sum = PESEL_WEIGHTS.reduce((acc, w, i) => acc + w * Number(ten[i]), 0);
  return `${ten}${(10 - (sum % 10)) % 10}`;
};

export const generators = {
  email,
  ipv4,
  ipv6,
  mac,
  ssn,
  pesel,
} satisfies Record<string, Generate>;
