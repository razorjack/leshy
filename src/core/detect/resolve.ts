import type { Detector, PreserveRule, Span } from "../types.ts";
import { TIER } from "../types.ts";
import { scanKeyValues, type KeyValue } from "./keyContext.ts";
import { TIMESTAMP } from "../preserve.ts";

const SOURCE_TIER = {
  structural: TIER.STRUCTURAL,
  "key-context": TIER.KEY_CONTEXT,
  semantic: TIER.SEMANTIC,
} as const;

export const spanTier = (s: Span): number => (s.validated ? TIER.VALIDATED : SOURCE_TIER[s.source]);

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
  const out: Range[] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last !== undefined && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
};

/** Index of the first range ending after `pos` — the only one that can hit it. */
const seek = (ranges: Range[], pos: number): number => {
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid]!.end <= pos) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const hits = (ranges: Range[], span: Range): boolean => {
  const r = ranges[seek(ranges, span.start)];
  return r !== undefined && r.start < span.end;
};

/** `span` minus every range in `taken`, left to right. */
const subtract = (taken: Range[], span: Range): Range[] => {
  const out: Range[] = [];
  let cursor = span.start;
  for (let i = seek(taken, span.start); i < taken.length && taken[i]!.start < span.end; i++) {
    const t = taken[i]!;
    if (t.start > cursor) out.push({ start: cursor, end: t.start });
    cursor = Math.max(cursor, t.end);
    if (cursor >= span.end) return out;
  }
  if (cursor < span.end) out.push({ start: cursor, end: span.end });
  return out;
};

/** Insert a range known not to overlap anything already in `taken`. */
const take = (taken: Range[], r: Range): void => {
  taken.splice(seek(taken, r.start), 0, r);
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

const merge = (a: Span, b: Span, input: string): Span => {
  const winner = spanTier(b) > spanTier(a) ? b : a;
  const start = winner.validated ? winner.start : a.start;
  const end = winner.validated ? winner.end : Math.max(a.end, b.end);
  return {
    start,
    end,
    text: input.slice(start, end),
    type: a.type,
    detector: winner.detector,
    source: winner.source,
    score: Math.max(a.score, b.score),
    validated: winner.validated,
  };
};

const mergeAdjacent = (spans: Span[], input: string): Span[] => {
  const out: Span[] = [];
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const prev = out[out.length - 1];
    // sorted by start, so prev.start <= s.start: overlap reduces to this
    const overlapping = prev !== undefined && s.start < prev.end;
    const glued =
      prev !== undefined &&
      FRAGMENTED.has(s.type) &&
      s.start >= prev.end &&
      GLUE.test(input.slice(prev.end, s.start));
    if (prev !== undefined && prev.type === s.type && (overlapping || glued)) {
      out[out.length - 1] = merge(prev, s, input);
    } else {
      out.push(s);
    }
  }
  return out;
};

/** Value ranges under keys a preserve rule names (optionally shape-checked). */
const preservedRanges = (rules: PreserveRule[], kvs: KeyValue[]): Range[] => {
  const out: Range[] = [];
  for (const rule of rules) {
    if (!rule.keys) continue;
    for (const kv of kvs) {
      if (rule.keys.test(kv.key) && (!rule.match || rule.match.test(kv.value))) {
        out.push({ start: kv.valueStart, end: kv.valueEnd });
      }
    }
  }
  return sortMerged(out);
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
    detectors.filter((d) => d.enabled && d.kind === "semantic").map((d) => d.type),
  );
  const corroborated = new Set(
    detectors
      .filter((d) => d.enabled && d.kind !== "semantic" && !semanticTypes.has(d.type))
      .map((d) => d.type),
  );
  const structuralRegions = sortMerged(structural);
  return semantic.filter((s) => {
    if (TIMESTAMP.test(s.text) || /^\d+$/.test(s.text)) return false;
    if (/^["']?\s*(?::|=>|=)/.test(input.slice(s.end, s.end + 5))) return false;
    if (corroborated.has(s.type)) return hits(structuralRegions, s);
    return true;
  });
};

/**
 * Fake-namespace values (Leshy's own output) define preserve regions, not
 * just self-drops: the whole matched span is protected so a re-scrub is a
 * no-op even when the model tags a fragment of a fake (a fake email's local
 * part reads as a person/org). This is what makes idempotence hold (adr/0002).
 */
const dropFakes = (spans: Span[], rules: PreserveRule[]): Span[] => {
  const fakeRegions = sortMerged(spans.filter((s) => rules.some((r) => r.isFake?.(s.text))));
  return spans.filter((s) => !hits(fakeRegions, s));
};

/** Preserve rules beat everything below TIER.VALIDATED. */
const applyPreserve = (spans: Span[], rules: PreserveRule[], kvs: KeyValue[]): Span[] => {
  const regions = preservedRanges(rules, kvs);
  const shapes = rules.filter((r) => !r.keys && r.match);
  const shaped = (s: Span): boolean => shapes.some((r) => r.match?.test(s.text));
  return spans.filter((s) => spanTier(s) >= TIER.VALIDATED || !(hits(regions, s) || shaped(s)));
};

/**
 * Settle overlaps by tier, then length, then declaration order; a loser is
 * trimmed to its uncovered remainder, never dropped, so coverage never shrinks.
 * A remainder with no letter or digit in it is not worth a fake.
 */
const settleOverlaps = (spans: Span[], detectors: Detector[], input: string): Span[] => {
  const order = new Map(detectors.map((d, i) => [d.id, i]));
  const rank = (s: Span): number => order.get(s.detector) ?? detectors.length;
  const sorted = [...spans].sort(
    (a, b) =>
      spanTier(b) - spanTier(a) ||
      b.end - b.start - (a.end - a.start) ||
      rank(a) - rank(b) ||
      a.start - b.start,
  );
  const chosen: Span[] = [];
  const taken: Range[] = [];
  for (const s of sorted) {
    for (const p of subtract(taken, s)) {
      const text = input.slice(p.start, p.end);
      if (!/[\p{L}\p{N}]/u.test(text)) continue;
      chosen.push({ ...s, start: p.start, end: p.end, text });
      take(taken, p);
    }
  }
  return chosen.sort((a, b) => a.start - b.start);
};

/**
 * Turns raw detector output into a non-overlapping, precedence-resolved span
 * list ready for substitution. Validated in the spike (scripts/spike).
 */
export const resolve = (
  rawSpans: Span[],
  input: string,
  detectors: Detector[],
  preserve: PreserveRule[],
  kvs?: KeyValue[],
): Span[] => {
  const keyValues = kvs ?? scanKeyValues(input);
  const rules = preserve.filter((r) => r.enabled);
  const bySource = (source: Span["source"]): Span[] => rawSpans.filter((s) => s.source === source);
  const structural = bySource("structural");
  const semantic = dropSemanticNoise(bySource("semantic"), structural, detectors, input);

  let spans = mergeAdjacent([...structural, ...bySource("key-context"), ...semantic], input);
  spans = dropFakes(spans, rules);
  spans = applyPreserve(spans, rules, keyValues);
  return settleOverlaps(spans, detectors, input);
};
