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
 * constituent.
 */
const mergeAdjacent = (spans: Span[], input: string): Span[] => {
  const glue = /^[\s\d,/.·-]{0,6}$/;
  const mergeable = new Set(["address", "person", "org"]);
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    // sorted by start, so prev.start <= s.start: overlap reduces to this
    const overlapping = prev !== undefined && s.start < prev.end;
    if (
      prev !== undefined &&
      prev.type === s.type &&
      (overlapping ||
        (mergeable.has(s.type) && s.start >= prev.end && glue.test(input.slice(prev.end, s.start))))
    ) {
      const winner = spanTier(s) > spanTier(prev) ? s : prev;
      prev.detector = winner.detector;
      prev.source = winner.source;
      prev.validated = winner.validated;
      prev.end = Math.max(prev.end, s.end);
      prev.text = input.slice(prev.start, prev.end);
      prev.score = Math.max(prev.score, s.score);
    } else {
      out.push({ ...s });
    }
  }
  return out;
};

/**
 * Turns raw detector output into a non-overlapping, precedence-resolved span
 * list ready for substitution. Validated in the spike (scripts/spike).
 *
 * Steps: filter semantic noise → merge semantic fragments → apply preserve
 * rules → resolve overlaps by tier, trimming losers to their uncovered
 * remainder so coverage never shrinks.
 */
export const resolve = (
  rawSpans: Span[],
  input: string,
  detectors: Detector[],
  preserve: PreserveRule[],
  kvs?: KeyValue[],
): Span[] => {
  const keyValues = kvs ?? scanKeyValues(input);
  const activePreserve = preserve.filter((r) => r.enabled);

  const preserved: Range[] = [];
  for (const rule of activePreserve) {
    if (!rule.keys) continue;
    for (const kv of keyValues) {
      if (rule.keys.test(kv.key) && (!rule.match || rule.match.test(kv.value))) {
        preserved.push({ start: kv.valueStart, end: kv.valueEnd });
      }
    }
  }
  const preserveRegions = sortMerged(preserved);
  const shapeRules = activePreserve.filter((r) => !r.keys && r.match);
  const preservedShape = (s: Span): boolean => shapeRules.some((r) => r.match?.test(s.text));

  // Corroboration applies to types the model does NOT own: when no semantic
  // detector claims a type (email, phone, ip…), a lone model guess of that
  // type is noise unless a structural match overlaps it. Types with a semantic
  // owner (person, address, org) trust the model outright.
  const semanticTypes = new Set(
    detectors.filter((d) => d.enabled && d.kind === "semantic").map((d) => d.type),
  );
  const corroborated = new Set(
    detectors
      .filter((d) => d.enabled && d.kind !== "semantic" && !semanticTypes.has(d.type))
      .map((d) => d.type),
  );
  const structural = rawSpans.filter((s) => s.source === "structural");
  const structuralRegions = sortMerged(structural);

  let semantic = rawSpans.filter((s) => s.source === "semantic");
  semantic = semantic.filter((s) => {
    // pure timestamps and bare numbers are never PII by themselves
    if (TIMESTAMP.test(s.text) || /^\d+$/.test(s.text)) return false;
    // a span in key position (right before : | => | =) names a field, not a value
    if (/^["']?\s*(?::|=>|=)/.test(input.slice(s.end, s.end + 5))) return false;
    if (corroborated.has(s.type)) return hits(structuralRegions, s);
    return true;
  });

  let spans = mergeAdjacent(
    [...structural, ...rawSpans.filter((s) => s.source === "key-context"), ...semantic],
    input,
  );

  // Fake-namespace values (Leshy's own output) define preserve regions, not
  // just self-drops: the whole matched span is protected so a re-scrub is a
  // no-op even when the model tags a fragment of a fake (a fake email's local
  // part reads as a person/org). This is what makes idempotence hold (adr/0002).
  const fakeRegions = sortMerged(
    spans.filter((s) => activePreserve.some((r) => r.isFake?.(s.text))),
  );
  spans = spans.filter((s) => !hits(fakeRegions, s));

  // preserve rules beat everything below TIER.VALIDATED
  spans = spans.filter(
    (s) => spanTier(s) >= TIER.VALIDATED || !(hits(preserveRegions, s) || preservedShape(s)),
  );

  const order = new Map(detectors.map((d, i) => [d.id, i]));
  const rank = (s: Span): number => order.get(s.detector) ?? detectors.length;
  const chosen: Span[] = [];
  const taken: Range[] = [];
  const sorted = spans.sort(
    (a, b) =>
      spanTier(b) - spanTier(a) ||
      b.end - b.start - (a.end - a.start) ||
      rank(a) - rank(b) ||
      a.start - b.start,
  );
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
