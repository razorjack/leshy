import type { Span } from "../../src/core/types.ts";
import type { Expectation, Sample } from "../../tests/fixtures/samples.ts";

export interface SampleScore {
  full: number;
  partial: number;
  miss: number;
  preserveViolations: number;
}

const locate = (input: string, exp: Expectation): [number, number] => {
  const idx = input.indexOf(exp.text);
  if (idx === -1) throw new Error(`gold text not found: ${exp.text}`);
  return [idx, idx + exp.text.length];
};

const coverage = (spans: Span[], start: number, end: number): number => {
  const len = end - start;
  const marks = Array.from({ length: len }, () => false);
  for (const s of spans) {
    for (let i = Math.max(s.start, start); i < Math.min(s.end, end); i++) marks[i - start] = true;
  }
  return marks.filter(Boolean).length / len;
};

export const evaluateSample = (sample: Sample, spans: Span[], verbose: boolean): SampleScore => {
  const score: SampleScore = { full: 0, partial: 0, miss: 0, preserveViolations: 0 };
  if (verbose) console.log(`\n--- ${sample.name}`);
  for (const exp of sample.gold) {
    const [start, end] = locate(sample.input, exp);
    const hits = spans.filter((s) => s.start < end && s.end > start);
    const by = [...new Set(hits.map((s) => `${s.detector}/${s.source}`))].join(", ");
    if (exp.expect === "catch") {
      const cov = coverage(hits, start, end);
      if (cov >= 1) score.full++;
      else if (cov > 0) score.partial++;
      else score.miss++;
      const status = cov >= 1 ? "FULL   " : cov > 0 ? "PARTIAL" : "MISS   ";
      if (verbose)
        console.log(
          `  [${status}] catch ${exp.type.padEnd(9)} ${JSON.stringify(exp.text)}${by ? ` <- ${by}` : ""}`,
        );
    } else {
      if (hits.length > 0) score.preserveViolations++;
      if (verbose)
        console.log(
          `  [${hits.length > 0 ? "FP-HIT " : "OK     "}] keep  ${exp.type.padEnd(9)} ${JSON.stringify(exp.text)}${by ? ` <- ${by}` : ""}`,
        );
    }
  }
  return score;
};

export const addScores = (a: SampleScore, b: SampleScore): SampleScore => ({
  full: a.full + b.full,
  partial: a.partial + b.partial,
  miss: a.miss + b.miss,
  preserveViolations: a.preserveViolations + b.preserveViolations,
});
