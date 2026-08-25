import type { CustomDetector, Detector, Span, StructuralDetector } from "../types.ts";

type Hit = Pick<Span, "start" | "end" | "text">;

const hits = (input: string, d: StructuralDetector | CustomDetector): Hit[] =>
  d.kind === "structural"
    ? Array.from(input.matchAll(d.match), (m) => ({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
      }))
    : d.match(input);

/** Runs structural (regex + validator) and custom detectors over the raw text. */
export const detectStructural = (input: string, detectors: Detector[]): Span[] => {
  const spans: Span[] = [];
  for (const d of detectors) {
    if (!d.enabled || (d.kind !== "structural" && d.kind !== "custom")) continue;
    const validated = d.validate !== undefined && d.heuristic !== true;
    for (const h of hits(input, d)) {
      if (d.validate && !d.validate(h.text, input, h.start)) continue;
      spans.push({ ...h, type: d.type, detector: d.id, source: "structural", score: 1, validated });
    }
  }
  return spans;
};
