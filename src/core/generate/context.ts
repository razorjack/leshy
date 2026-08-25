import type { EntityType, GenerateContext, LocaleSetting } from "../types.ts";
import { deriveSeed, normalise } from "./derive.ts";
import { localeFor } from "./faker.ts";

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

/** Seeds already derived in this run, keyed by scope + identity. */
export type SeedCache = Map<string, number>;

/**
 * Builds the per-span derivation context. `personSeed` is span-independent
 * (keyed only on salt + token sequence) so a person name and an email local
 * part sharing tokens derive one identity (adr/0002 linked identities).
 *
 * `retry` reseeds every derivation on a collision or charset violation
 * (adr/0002): the engine bumps it until the fake is free. It changes personSeed
 * too, so even person/email fakes make progress — at the cost of breaking their
 * linkage for that one colliding value (an accepted collision consequence).
 *
 * `cache` skips the SHA-256 round trip for a value already seen in the run: a
 * log repeats the same IP thousands of times, and the seed is the same each time.
 */
export const makeContext = async (
  original: string,
  type: EntityType,
  salt: string,
  locale: LocaleSetting = "auto",
  retry = 0,
  cache?: SeedCache,
): Promise<GenerateContext> => {
  const normalized = normalise(original, type);
  const tag = retry > 0 ? `:retry:${retry}` : "";
  const scope = `${type}${tag}`;
  const key = `${scope}\0${normalized}`;
  let seed = cache?.get(key);
  if (seed === undefined) {
    seed = await deriveSeed(salt, scope, normalized);
    cache?.set(key, seed);
  }
  return {
    original,
    normalized,
    seed,
    seedFor: (scope) => hash32(`${seed}:${scope}`),
    personSeed: (tokens) => hash32(`${salt}:person:${tokens.join(" ")}${tag}`),
    localeFor: (hint) => (locale === "auto" ? localeFor(hint ?? original) : locale),
  };
};
