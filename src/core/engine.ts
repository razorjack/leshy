import type { ScrubResult, Span } from "./types.ts";
import type { ResolvedConfig } from "./config.ts";
import { scanKeyValues } from "./detect/keyContext.ts";
import { detectByKey } from "./detect/keyContext.ts";
import { detectStructural } from "./detect/structural.ts";
import { resolve } from "./detect/resolve.ts";

export interface EngineContext {
  config: ResolvedConfig;
  /** Model pass, or undefined when the model is disabled or still loading. */
  semantic?: (input: string) => Promise<Span[]>;
}

/**
 * Detection pipeline: structural + key-context + semantic, resolved by
 * precedence into non-overlapping spans. Fully implemented and validated by
 * scripts/spike against docs/spike-samples (22/22 catches, 0 preserve hits).
 */
export const detect = async (input: string, ctx: EngineContext): Promise<Span[]> => {
  const kvs = scanKeyValues(input);
  const detectors = ctx.config.detectors;
  const raw = [
    ...detectStructural(input, detectors),
    ...detectByKey(input, detectors, kvs),
    ...(ctx.semantic ? await ctx.semantic(input) : []),
  ];
  return resolve(raw, input, detectors, ctx.config.preserve, kvs);
};

/**
 * TODO(opus): docs/implementation-plan.md steps 8–11. Contract:
 *
 * 1. `await detect(input, ctx)` — spans arrive non-overlapping, sorted.
 * 2. For each span, derive the deterministic seed via generate/derive.ts
 *    (normalise → SHA-256(salt : type-scope : normalized) → uint32) and call
 *    the owning detector's `generate(ctx)`.
 * 3. Enforce generator output constraints: no quotes/backslashes/newlines, no
 *    two distinct normalised sources sharing one fake within this run (bump
 *    the seed scope with a counter until free).
 * 4. Splice fakes into the input left-to-right, tracking the output-coordinate
 *    ranges for each replacement (bytes outside spans must survive verbatim).
 * 5. Return { output, replacements } — replacements power the UI highlights.
 *
 * Idempotence: scrub(scrub(x)) === scrub(x) for structured types via the
 * fake-namespace preserve rules; for person/address/org it holds within a run
 * (adr/0002 documents the cross-run limitation).
 */
export const scrub = (input: string, ctx: EngineContext): Promise<ScrubResult> => {
  void input;
  void ctx;
  throw new Error("scrub() not implemented — docs/implementation-plan.md step 8");
};
