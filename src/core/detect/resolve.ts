import type { Detector, PreserveRule, Span } from "../types.ts";
import { TIER } from "../types.ts";
import { scanKeyValues, type KeyValue } from "./keyContext.ts";
import { TIMESTAMP } from "../preserve.ts";

const SOURCE_TIER = {
  structural: TIER.STRUCTURAL,
  "key-context": TIER.KEY_CONTEXT,
  semantic: TIER.SEMANTIC,
} as const;

export const spanTier = (span: Span): number =>
  span.validated ? TIER.VALIDATED : SOURCE_TIER[span.source];

interface Range {
  start: number;
  end: number;
}

/**
 * Sorted non-overlapping ranges, queried by binary search. Every stage below
 * asks "does this span hit that set of ranges?" once per span; scanning the set
 * makes resolve() quadratic, and a large paste produces tens of thousands of
 * spans (a 460 KB log took ~30 s before this).
 */
const sortMerged = (ranges: Range[]): Range[] => {
  const mergedRanges: Range[] = [];
  const sortedRanges = [...ranges].sort((left, right) => left.start - right.start);

  for (const range of sortedRanges) {
    const lastRange = mergedRanges[mergedRanges.length - 1];
    if (lastRange !== undefined && range.start <= lastRange.end) {
      lastRange.end = Math.max(lastRange.end, range.end);
    } else {
      mergedRanges.push({ start: range.start, end: range.end });
    }
  }
  return mergedRanges;
};

/** Index of the first range ending after `pos` — the only one that can hit it. */
const seek = (ranges: Range[], position: number): number => {
  let lower = 0;
  let upper = ranges.length;
  while (lower < upper) {
    const middle = (lower + upper) >> 1;
    if (ranges[middle]!.end <= position) lower = middle + 1;
    else upper = middle;
  }
  return lower;
};

const intersects = (ranges: Range[], span: Range): boolean => {
  const candidate = ranges[seek(ranges, span.start)];
  return candidate !== undefined && candidate.start < span.end;
};

/** `span` minus every range in `taken`, left to right. */
const subtract = (taken: Range[], span: Range): Range[] => {
  const uncovered: Range[] = [];
  let cursor = span.start;
  for (let i = seek(taken, span.start); i < taken.length && taken[i]!.start < span.end; i++) {
    const takenRange = taken[i]!;
    if (takenRange.start > cursor) uncovered.push({ start: cursor, end: takenRange.start });
    cursor = Math.max(cursor, takenRange.end);
    if (cursor >= span.end) return uncovered;
  }
  if (cursor < span.end) uncovered.push({ start: cursor, end: span.end });
  return uncovered;
};

/** Insert a range known not to overlap anything already in `taken`. */
const take = (taken: Range[], range: Range): void => {
  taken.splice(seek(taken, range.start), 0, range);
};

/**
 * Merge same-type spans that describe one entity, in two shapes:
 *
 *  - **overlapping**: two detectors found the same value at different extents
 *    (a structural email inside the key-context span for the whole value).
 *    Without this the shorter, higher-tier span wins and the remainder is
 *    emitted as a second span of the same type — a value like
 *    `"email": "foo@bar.com/extra"` would produce two fake emails spliced
 *    together.
 *  - **adjacent across short glue** (whitespace, digits, punctuation), limited
 *    to address/person/org: models return street / building / city as separate
 *    fragments, and a partial replacement would leak the remainder.
 *
 * The merged span spans the union and keeps the identity of its highest-tier
 * constituent, unless that constituent is validated: a checksum proves the
 * extent, so `"pesel": "44051401359 (old)"` keeps `(old)` outside the span.
 */
const GLUE = /^[\s\d,/.·-]{0,6}$/;
const FRAGMENTED = new Set(["address", "person", "org"]);

const merge = (previous: Span, current: Span, input: string): Span => {
  const winner = spanTier(current) > spanTier(previous) ? current : previous;
  const start = winner.validated ? winner.start : previous.start;
  const end = winner.validated ? winner.end : Math.max(previous.end, current.end);
  return {
    start,
    end,
    text: input.slice(start, end),
    type: previous.type,
    detector: winner.detector,
    source: winner.source,
    score: Math.max(previous.score, current.score),
    validated: winner.validated,
  };
};

const mergeAdjacent = (spans: Span[], input: string): Span[] => {
  const mergedSpans: Span[] = [];
  const sortedSpans = [...spans].sort((left, right) => left.start - right.start);

  for (const span of sortedSpans) {
    const previous = mergedSpans[mergedSpans.length - 1];
    // Sorted by start, so previous.start <= span.start: overlap reduces to this.
    const overlapping = previous !== undefined && span.start < previous.end;
    const glued =
      previous !== undefined &&
      FRAGMENTED.has(span.type) &&
      span.start >= previous.end &&
      GLUE.test(input.slice(previous.end, span.start));

    if (previous !== undefined && previous.type === span.type && (overlapping || glued)) {
      mergedSpans[mergedSpans.length - 1] = merge(previous, span, input);
    } else {
      mergedSpans.push(span);
    }
  }
  return mergedSpans;
};

/** Value ranges under keys a preserve rule names (optionally shape-checked). */
const preservedRanges = (preserveRules: PreserveRule[], keyValues: KeyValue[]): Range[] => {
  const ranges: Range[] = [];
  for (const rule of preserveRules) {
    if (!rule.keys) continue;
    for (const keyValue of keyValues) {
      const keyMatches = rule.keys.test(keyValue.key);
      const valueMatches = !rule.match || rule.match.test(keyValue.value);
      if (keyMatches && valueMatches) {
        ranges.push({ start: keyValue.valueStart, end: keyValue.valueEnd });
      }
    }
  }
  return sortMerged(ranges);
};

/**
 * Model output the rules know better than to trust: pure timestamps and bare
 * numbers, spans in key position (right before `:`, `=>` or `=`), and — for
 * types the model does not own (email, phone, ip…) — a lone guess with no
 * structural match under it. Types with a semantic owner (person, address,
 * org) trust the model outright.
 */
const dropSemanticNoise = (
  semantic: Span[],
  structural: Span[],
  detectors: Detector[],
  input: string,
): Span[] => {
  const semanticTypes = new Set(
    detectors
      .filter((detector) => detector.enabled && detector.kind === "semantic")
      .map((detector) => detector.type),
  );
  const corroboratedTypes = new Set(
    detectors
      .filter(
        (detector) =>
          detector.enabled && detector.kind !== "semantic" && !semanticTypes.has(detector.type),
      )
      .map((detector) => detector.type),
  );
  const structuralRegions = sortMerged(structural);
  return semantic.filter((span) => {
    if (TIMESTAMP.test(span.text) || /^\d+$/.test(span.text)) return false;
    if (/^["']?\s*(?::|=>|=)/.test(input.slice(span.end, span.end + 5))) return false;
    if (corroboratedTypes.has(span.type)) return intersects(structuralRegions, span);
    return true;
  });
};

/**
 * Fake-namespace values (Leshy's own output) define preserve regions, not
 * just self-drops: the whole matched span is protected so a re-scrub is a
 * no-op even when the model tags a fragment of a fake (a fake email's local
 * part reads as a person/org). This is what makes idempotence hold (adr/0002).
 */
const dropFakes = (spans: Span[], preserveRules: PreserveRule[]): Span[] => {
  const fakeSpans = spans.filter((span) => preserveRules.some((rule) => rule.isFake?.(span.text)));
  const fakeRegions = sortMerged(fakeSpans);
  return spans.filter((span) => !intersects(fakeRegions, span));
};

/**
 * Values the user pointed at and said "keep" outrank every tier, checksum
 * included: the decision was made looking at this very output. The whole
 * region goes, so no fragment of a kept value is scrubbed by another detector.
 */
const applyKeep = (spans: Span[], keep: string[]): Span[] => {
  if (keep.length === 0) return spans;
  const keptValues = new Set(keep);
  const keptRegions = sortMerged(spans.filter((span) => keptValues.has(span.text)));
  return spans.filter((span) => !intersects(keptRegions, span));
};

/** Preserve rules beat everything below TIER.VALIDATED. */
const applyPreserve = (
  spans: Span[],
  preserveRules: PreserveRule[],
  keyValues: KeyValue[],
): Span[] => {
  const keyRegions = preservedRanges(preserveRules, keyValues);
  const shapeRules = preserveRules.filter((rule) => !rule.keys && rule.match);

  return spans.filter((span) => {
    if (spanTier(span) >= TIER.VALIDATED) return true;
    const matchesShape = shapeRules.some((rule) => rule.match?.test(span.text));
    return !intersects(keyRegions, span) && !matchesShape;
  });
};

/**
 * Settle overlaps by tier, then length, then declaration order; a loser is
 * trimmed to its uncovered remainder, never dropped, so coverage never shrinks.
 * A remainder with no letter or digit in it is not worth a fake.
 */
const settleOverlaps = (spans: Span[], detectors: Detector[], input: string): Span[] => {
  const detectorOrder = new Map(detectors.map((detector, index) => [detector.id, index]));
  const detectorRank = (span: Span): number => detectorOrder.get(span.detector) ?? detectors.length;
  const sorted = [...spans].sort(
    (left, right) =>
      spanTier(right) - spanTier(left) ||
      right.end - right.start - (left.end - left.start) ||
      detectorRank(left) - detectorRank(right) ||
      left.start - right.start,
  );
  const chosen: Span[] = [];
  const taken: Range[] = [];

  for (const span of sorted) {
    for (const remainder of subtract(taken, span)) {
      const text = input.slice(remainder.start, remainder.end);
      if (!/[\p{L}\p{N}]/u.test(text)) continue;
      chosen.push({ ...span, start: remainder.start, end: remainder.end, text });
      take(taken, remainder);
    }
  }
  return chosen.sort((left, right) => left.start - right.start);
};

/**
 * Turns raw detector output into a non-overlapping, precedence-resolved span
 * list ready for substitution. Validated in the spike (scripts/spike).
 */
export const resolve = (
  detectedSpans: Span[],
  input: string,
  detectors: Detector[],
  preserve: PreserveRule[],
  scannedKeyValues?: KeyValue[],
  keep: string[] = [],
): Span[] => {
  const keyValues = scannedKeyValues ?? scanKeyValues(input);
  const preserveRules = preserve.filter((rule) => rule.enabled);
  const spansFrom = (source: Span["source"]): Span[] =>
    detectedSpans.filter((span) => span.source === source);

  const structuralSpans = spansFrom("structural");
  const keySpans = spansFrom("key-context");
  const semanticSpans = dropSemanticNoise(spansFrom("semantic"), structuralSpans, detectors, input);

  let resolvedSpans = mergeAdjacent([...structuralSpans, ...keySpans, ...semanticSpans], input);
  resolvedSpans = dropFakes(resolvedSpans, preserveRules);
  resolvedSpans = applyPreserve(resolvedSpans, preserveRules, keyValues);
  resolvedSpans = applyKeep(resolvedSpans, keep);

  return settleOverlaps(resolvedSpans, detectors, input);
};
