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

/**
 * TODO(opus): implementation-plan.md step 8.
 * - trim + NFC + collapse inner whitespace for all types
 * - email: lowercase whole value
 * - person: keep diacritics and case-fold ONLY for the identity key
 * - phone/pesel/ssn/credit-card/iban: strip separators (digits/uppercase only)
 */
export const normalise = (value: string, type: EntityType): string => {
  void value;
  void type;
  throw new Error("normalise() not implemented — docs/implementation-plan.md step 8");
};

/** TODO(opus): implementation-plan.md step 8. SHA-256 → first 4 bytes → uint32. */
export const deriveSeed = (salt: string, scope: string, normalized: string): Promise<number> => {
  void salt;
  void scope;
  void normalized;
  throw new Error("deriveSeed() not implemented — docs/implementation-plan.md step 8");
};

/**
 * TODO(opus): implementation-plan.md step 9.
 * Splits an email local part / username into name-ish tokens so linked
 * identities work: tokens of "jan.kowalski" == tokens of "Jan Kowalski"
 * ⇒ both derive the same fake person. Returns null when not name-like.
 */
export const nameTokens = (value: string): string[] | null => {
  void value;
  throw new Error("nameTokens() not implemented — docs/implementation-plan.md step 9");
};
