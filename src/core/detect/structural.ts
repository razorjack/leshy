import type { Detector, Span } from "../types.ts";

/** Runs structural (regex + validator) and custom detectors over the raw text. */
export const detectStructural = (input: string, detectors: Detector[]): Span[] => {
  const spans: Span[] = [];
  for (const d of detectors) {
    if (!d.enabled) continue;
    if (d.kind === "structural") {
      for (const m of input.matchAll(d.match)) {
        const text = m[0];
        if (d.validate && !d.validate(text, input, m.index)) continue;
        spans.push({
          start: m.index,
          end: m.index + text.length,
          text,
          type: d.type,
          detector: d.id,
          source: "structural",
          score: 1,
          validated: d.validate !== undefined && d.heuristic !== true,
        });
      }
    } else if (d.kind === "custom") {
      for (const c of d.match(input)) {
        if (d.validate && !d.validate(c.text, input, c.start)) continue;
        spans.push({
          ...c,
          type: d.type,
          detector: d.id,
          source: "structural",
          score: 1,
          validated: d.validate !== undefined && d.heuristic !== true,
        });
      }
    }
  }
  return spans;
};
