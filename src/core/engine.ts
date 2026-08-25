import type { Detector, Replacement, ScrubResult, Span } from "./types.ts";
import type { ResolvedConfig } from "./config.ts";
import { detectByKey, scanKeyValues } from "./detect/keyContext.ts";
import { detectStructural } from "./detect/structural.ts";
import { resolve } from "./detect/resolve.ts";
import { makeContext, type SeedCache } from "./generate/context.ts";

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
  return resolve(raw, input, detectors, ctx.config.preserve, kvs, ctx.config.keep);
};

// Generator output may never contain these — they would corrupt the surrounding
// JSON/Ruby/log structure the user copies out (adr/0002). Violations reseed.
const FORBIDDEN = /["'\\\n\r]/;
const MAX_RETRIES = 8;

/**
 * Detect → derive → generate → splice. Fakes are spliced left-to-right; bytes
 * outside a span survive verbatim (byte fidelity, adr/0003). Within a run a
 * fake→source map guarantees the same value maps to one fake and two distinct
 * values never collide (reseeding via `:retry:n` on collision or charset
 * violation). Idempotence per adr/0002: structured types via fake-namespace
 * preserve rules; person/address/org within a run.
 */
export const scrub = async (input: string, ctx: EngineContext): Promise<ScrubResult> => {
  const spans = await detect(input, ctx);
  const salt = ctx.config.salt;
  const byId = new Map<string, Detector>(ctx.config.detectors.map((d) => [d.id, d]));
  const used = new Map<string, string>(); // fake → normalised source that owns it
  const seeds: SeedCache = new Map();

  const replacements: Replacement[] = [];
  let output = "";
  let cursor = 0;

  for (const span of spans) {
    const detector = byId.get(span.detector);
    if (!detector) continue;

    let gctx = await makeContext(span.text, span.type, salt, ctx.config.locale, 0, seeds);
    const normalized = gctx.normalized;
    let fake = detector.generate(gctx);
    const free = (f: string): boolean => {
      const owner = used.get(f);
      // A fake equal to its source is a leak, not a substitution: reseed.
      if (f === span.text || FORBIDDEN.test(f)) return false;
      return owner === undefined || owner === normalized;
    };
    for (let retry = 1; retry <= MAX_RETRIES && !free(fake); retry++) {
      gctx = await makeContext(span.text, span.type, salt, ctx.config.locale, retry, seeds);
      fake = detector.generate(gctx);
    }
    used.set(fake, normalized);

    output += input.slice(cursor, span.start);
    const start = output.length;
    output += fake;
    replacements.push({
      start,
      end: output.length,
      sourceStart: span.start,
      sourceEnd: span.end,
      fake,
      type: span.type,
      detector: span.detector,
      label: detector.label,
    });
    cursor = span.end;
  }
  output += input.slice(cursor);
  return { output, replacements };
};
