import type { EntityType, GenerateContext } from "../types.ts";
import { deriveSeed, normalise } from "./derive.ts";

/**
 * Synchronous mixer for sub-scope seeds. The primary seed is SHA-256-derived
 * (adr/0002, deriveSeed), but `seedFor` and `personSeed` must be synchronous per
 * the GenerateContext contract, so they use this fast deterministic hash. It is
 * not a security primitive — it only decorrelates independent random draws.
 */
const hash32 = (str: string): number => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
};

/**
 * Builds the per-span derivation context. `personSeed` is span-independent
 * (keyed only on salt + token sequence) so a person name and an email local
 * part sharing tokens derive one identity (adr/0002 linked identities).
 */
export const makeContext = async (
  original: string,
  type: EntityType,
  salt: string,
): Promise<GenerateContext> => {
  const normalized = normalise(original, type);
  const seed = await deriveSeed(salt, type, normalized);
  return {
    original,
    normalized,
    seed,
    seedFor: (scope) => hash32(`${seed}:${scope}`),
    personSeed: (tokens) => hash32(`${salt}:person:${tokens.join(" ")}`),
  };
};
