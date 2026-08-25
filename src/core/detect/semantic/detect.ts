import type { Detector, SemanticDetector, Span } from "../../types.ts";
import type { Gliner } from "./gliner/runtime.ts";
import { WordSplitter } from "./gliner/processor.ts";

// The model has a bounded context, so long inputs are windowed by word count
// (adr/0003). The overlap guarantees any entity shorter than it is wholly
// inside at least one window, so nothing is lost at a window seam. Words are
// counted the way the model counts them: every brace, quote and comma is one,
// so a minified JSON line does not become a single window of thousands of
// tokens and a span enumeration twelve times that size.
const CHUNK_WORDS = 250;
const OVERLAP_WORDS = 40;

const splitter = new WordSplitter();

/** Char ranges of ~CHUNK_WORDS-word windows over the input, OVERLAP_WORDS-shared. */
const windows = (input: string): Array<{ start: number; end: number }> => {
  const words = Array.from(splitter.split(input), ([, start, end]) => ({ start, end }));
  if (words.length === 0) return [];
  if (words.length <= CHUNK_WORDS) return [{ start: 0, end: input.length }];

  const step = CHUNK_WORDS - OVERLAP_WORDS;
  const out: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < words.length; i += step) {
    const slice = words.slice(i, i + CHUNK_WORDS);
    out.push({ start: slice[0]!.start, end: slice[slice.length - 1]!.end });
    if (i + CHUNK_WORDS >= words.length) break;
  }
  return out;
};

/**
 * One or more model passes resolve all enabled semantic detectors: their
 * zero-shot labels are sent together, and each returned entity maps back to the
 * detector that owns its label. Long inputs are chunked into overlapping word
 * windows; per-chunk offsets are remapped to the input and exact duplicates
 * (from the overlaps) deduped before resolve. Per-detector thresholds apply
 * after the pass.
 */
export const detectSemantic = async (
  input: string,
  detectors: Detector[],
  gliner: Gliner,
  defaultThreshold: number,
): Promise<Span[]> => {
  const semantic = detectors.filter(
    (d): d is SemanticDetector => d.kind === "semantic" && d.enabled,
  );
  if (semantic.length === 0 || input.trim() === "") return [];

  const labelOwner = new Map<string, SemanticDetector>();
  for (const d of semantic) {
    for (const label of d.labels) {
      if (!labelOwner.has(label)) labelOwner.set(label, d);
    }
  }
  const thresholds = semantic.map((d) => d.threshold ?? defaultThreshold);
  const floor = Math.min(...thresholds);
  const labels = [...labelOwner.keys()];

  const byKey = new Map<string, Span>();
  for (const w of windows(input)) {
    const entities = await gliner.extractEntities(input.slice(w.start, w.end), labels, {
      threshold: floor,
    });
    for (const e of entities) {
      const owner = labelOwner.get(e.label);
      if (!owner || e.score < (owner.threshold ?? defaultThreshold)) continue;
      const start = e.start + w.start;
      const end = e.end + w.start;
      const key = `${start}:${end}:${owner.id}`;
      const prev = byKey.get(key);
      if (prev && prev.score >= e.score) continue;
      byKey.set(key, {
        start,
        end,
        text: input.slice(start, end),
        type: owner.type,
        detector: owner.id,
        source: "semantic",
        score: e.score,
      });
    }
  }
  return [...byKey.values()];
};
