import type { EntityType } from "../types.ts";

/**
 * Deterministic derivation (docs/adr/0002-consistency-derivation.md):
 *
 *   normalise(value, type) → identity key
 *   SHA-256(`leshy:v1:${salt}:${scope}:${key}`) via crypto.subtle
 *   first 4 bytes big-endian → uint32 seed
 *   seed → seeded Faker instance → fake
 *
 * Same input ⇒ same fake, across pastes and sessions, with nothing stored.
 */

// Types whose identity is the bare alphanumeric payload: separators and casing
// carry no identity, so "+48 601 234 567" and "48601234567" are one person.
const DIGIT_TYPES: ReadonlySet<EntityType> = new Set([
  "phone",
  "pesel",
  "ssn",
  "steuer-id",
  "credit-card",
  "iban",
]);

export const normalise = (value: string, type: EntityType): string => {
  const normalized = value.normalize("NFC").trim().replace(/\s+/g, " ");
  // person casefolds for the identity key but KEEPS diacritics — folding
  // `Łukasz`→`Lukasz` could link two distinct people (adr/0002).
  if (type === "email" || type === "person") return normalized.toLowerCase();
  if (DIGIT_TYPES.has(type)) {
    return normalized.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  }
  return normalized;
};

export const deriveSeed = async (
  salt: string,
  scope: string,
  normalized: string,
): Promise<number> => {
  const seedInput = new TextEncoder().encode(`leshy:v1:${salt}:${scope}:${normalized}`);
  const digest = await crypto.subtle.digest("SHA-256", seedInput);
  return new DataView(digest).getUint32(0, false);
};

/**
 * Splits an email local part / username into name-ish tokens so linked
 * identities work: tokens of "jan.kowalski" == tokens of "Jan Kowalski"
 * ⇒ both derive the same fake person. Returns null when not name-like.
 */
export const nameTokens = (value: string): string[] | null => {
  const parts = value
    .normalize("NFC")
    .toLowerCase()
    .split(/[._+\-\s]+/);
  const tokens = parts
    .map((part) => part.replace(/\d+/g, ""))
    .filter((part) => /^\p{L}{2,}$/u.test(part));
  return tokens.length > 0 ? tokens : null;
};
