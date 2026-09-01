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

interface WordWindow {
  start: number;
  end: number;
}

/** Char ranges of ~CHUNK_WORDS-word windows over the input, OVERLAP_WORDS-shared. */
const windows = (input: string): WordWindow[] => {
  const words = Array.from(splitter.split(input), ([, start, end]) => ({ start, end }));
  if (words.length === 0) return [];
  if (words.length <= CHUNK_WORDS) return [{ start: 0, end: input.length }];

  const step = CHUNK_WORDS - OVERLAP_WORDS;
  const wordWindows: WordWindow[] = [];
  for (let i = 0; i < words.length; i += step) {
    const windowWords = words.slice(i, i + CHUNK_WORDS);
    wordWindows.push({
      start: windowWords[0]!.start,
      end: windowWords[windowWords.length - 1]!.end,
    });
    if (i + CHUNK_WORDS >= words.length) break;
  }
  return wordWindows;
};

const collectLabelOwners = (detectors: SemanticDetector[]): Map<string, SemanticDetector> => {
  const labelOwners = new Map<string, SemanticDetector>();
  for (const detector of detectors) {
    for (const label of detector.labels) {
      if (!labelOwners.has(label)) labelOwners.set(label, detector);
    }
  }
  return labelOwners;
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
  const semanticDetectors = detectors.filter(
    (detector): detector is SemanticDetector => detector.kind === "semantic" && detector.enabled,
  );
  if (semanticDetectors.length === 0 || input.trim() === "") return [];

  const labelOwners = collectLabelOwners(semanticDetectors);
  const thresholds = semanticDetectors.map((detector) => detector.threshold ?? defaultThreshold);
  const modelThreshold = Math.min(...thresholds);
  const labels = [...labelOwners.keys()];

  const spansByPosition = new Map<string, Span>();
  for (const window of windows(input)) {
    const windowText = input.slice(window.start, window.end);
    const entities = await gliner.extractEntities(windowText, labels, {
      threshold: modelThreshold,
    });
    for (const entity of entities) {
      const detector = labelOwners.get(entity.label);
      if (!detector) continue;
      if (entity.score < (detector.threshold ?? defaultThreshold)) continue;

      const start = entity.start + window.start;
      const end = entity.end + window.start;
      const positionKey = `${start}:${end}:${detector.id}`;
      const previousSpan = spansByPosition.get(positionKey);
      if (previousSpan && previousSpan.score >= entity.score) continue;

      spansByPosition.set(positionKey, {
        start,
        end,
        text: input.slice(start, end),
        type: detector.type,
        detector: detector.id,
        source: "semantic",
        score: entity.score,
      });
    }
  }
  return [...spansByPosition.values()];
};
