import type { Span } from "../../src/core/types.ts";
import type { Expectation, Sample } from "../../tests/fixtures/samples.ts";

export interface SampleScore {
  full: number;
  partial: number;
  miss: number;
  preserveViolations: number;
}

const locate = (input: string, expectation: Expectation): [number, number] => {
  const start = input.indexOf(expectation.text);
  if (start === -1) throw new Error(`gold text not found: ${expectation.text}`);
  return [start, start + expectation.text.length];
};

const coverage = (spans: Span[], start: number, end: number): number => {
  const length = end - start;
  const marks = Array.from({ length }, () => false);
  for (const span of spans) {
    for (let i = Math.max(span.start, start); i < Math.min(span.end, end); i++) {
      marks[i - start] = true;
    }
  }
  return marks.filter(Boolean).length / length;
};

const catchStatus = (covered: number): string => {
  if (covered >= 1) return "FULL   ";
  if (covered > 0) return "PARTIAL";
  return "MISS   ";
};

export const evaluateSample = (sample: Sample, spans: Span[], verbose: boolean): SampleScore => {
  const score: SampleScore = { full: 0, partial: 0, miss: 0, preserveViolations: 0 };
  if (verbose) console.log(`\n--- ${sample.name}`);
  for (const expectation of sample.gold) {
    const [start, end] = locate(sample.input, expectation);
    const hits = spans.filter((span) => span.start < end && span.end > start);
    const detectors = [...new Set(hits.map((span) => `${span.detector}/${span.source}`))].join(
      ", ",
    );
    const detectorSuffix = detectors ? ` <- ${detectors}` : "";

    if (expectation.expect === "catch") {
      const covered = coverage(hits, start, end);
      if (covered >= 1) score.full++;
      else if (covered > 0) score.partial++;
      else score.miss++;
      if (verbose) {
        console.log(
          `  [${catchStatus(covered)}] catch ${expectation.type.padEnd(9)} ${JSON.stringify(expectation.text)}${detectorSuffix}`,
        );
      }
    } else {
      if (hits.length > 0) score.preserveViolations++;
      if (verbose) {
        const status = hits.length > 0 ? "FP-HIT " : "OK     ";
        console.log(
          `  [${status}] keep  ${expectation.type.padEnd(9)} ${JSON.stringify(expectation.text)}${detectorSuffix}`,
        );
      }
    }
  }
  return score;
};

export const addScores = (left: SampleScore, right: SampleScore): SampleScore => ({
  full: left.full + right.full,
  partial: left.partial + right.partial,
  miss: left.miss + right.miss,
  preserveViolations: left.preserveViolations + right.preserveViolations,
});
