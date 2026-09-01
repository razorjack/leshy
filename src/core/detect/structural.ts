import type { CustomDetector, Detector, Span, StructuralDetector } from "../types.ts";

type Hit = Pick<Span, "start" | "end" | "text">;

const findHits = (input: string, detector: StructuralDetector | CustomDetector): Hit[] => {
  if (detector.kind === "custom") return detector.match(input);

  return Array.from(input.matchAll(detector.match), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
  }));
};

/** Runs structural (regex + validator) and custom detectors over the raw text. */
export const detectStructural = (input: string, detectors: Detector[]): Span[] => {
  const spans: Span[] = [];
  for (const detector of detectors) {
    if (!detector.enabled) continue;
    if (detector.kind !== "structural" && detector.kind !== "custom") continue;

    const validated = detector.validate !== undefined && detector.heuristic !== true;
    for (const hit of findHits(input, detector)) {
      if (detector.validate && !detector.validate(hit.text, input, hit.start)) continue;
      spans.push({
        ...hit,
        type: detector.type,
        detector: detector.id,
        source: "structural",
        score: 1,
        validated,
      });
    }
  }
  return spans;
};
