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
export const detect = async (input: string, context: EngineContext): Promise<Span[]> => {
  const keyValues = scanKeyValues(input);
  const detectors = context.config.detectors;

  const structuralSpans = detectStructural(input, detectors);
  const keySpans = detectByKey(input, detectors, keyValues);
  const semanticSpans = context.semantic ? await context.semantic(input) : [];
  const detectedSpans = [...structuralSpans, ...keySpans, ...semanticSpans];

  return resolve(
    detectedSpans,
    input,
    detectors,
    context.config.preserve,
    keyValues,
    context.config.keep,
  );
};

// Generator output may never contain these — they would corrupt the surrounding
// JSON/Ruby/log structure the user copies out (adr/0002). Violations reseed.
const FORBIDDEN = /["'\\\n\r]/;
const MAX_RETRIES = 8;

interface GenerateFakeOptions {
  span: Span;
  detector: Detector;
  context: EngineContext;
  fakeOwners: Map<string, string>;
  seedCache: SeedCache;
}

const generateFake = async ({
  span,
  detector,
  context,
  fakeOwners,
  seedCache,
}: GenerateFakeOptions): Promise<string> => {
  let fake = "";
  let normalized = "";

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    const generateContext = await makeContext({
      original: span.text,
      type: span.type,
      salt: context.config.salt,
      locale: context.config.locale,
      retry,
      cache: seedCache,
    });
    fake = detector.generate(generateContext);
    normalized = generateContext.normalized;

    const owner = fakeOwners.get(fake);
    const available = owner === undefined || owner === normalized;
    const valid = fake !== span.text && !FORBIDDEN.test(fake);
    if (available && valid) break;
  }

  fakeOwners.set(fake, normalized);
  return fake;
};

/**
 * Detect → derive → generate → splice. Fakes are spliced left-to-right; bytes
 * outside a span survive verbatim (byte fidelity, adr/0003). Within a run a
 * fake→source map guarantees the same value maps to one fake and two distinct
 * values never collide (reseeding via `:retry:n` on collision or charset
 * violation). Idempotence per adr/0002: structured types via fake-namespace
 * preserve rules; person/address/org within a run.
 */
export const scrub = async (input: string, context: EngineContext): Promise<ScrubResult> => {
  const spans = await detect(input, context);
  const detectorsById = new Map(
    context.config.detectors.map((detector) => [detector.id, detector]),
  );
  const fakeOwners = new Map<string, string>();
  const seedCache: SeedCache = new Map();

  const replacements: Replacement[] = [];
  let output = "";
  let sourceCursor = 0;

  for (const span of spans) {
    const detector = detectorsById.get(span.detector);
    if (!detector) continue;

    const fake = await generateFake({ span, detector, context, fakeOwners, seedCache });
    output += input.slice(sourceCursor, span.start);
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
    sourceCursor = span.end;
  }

  output += input.slice(sourceCursor);
  return { output, replacements };
};
