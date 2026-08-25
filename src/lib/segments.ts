import type { Replacement } from "../core/types.ts";

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "mark"; text: string; rep: Replacement };

type Range = (rep: Replacement) => [start: number, end: number];

/**
 * Cuts text at the given replacement ranges. Offsets are UTF-16 indices as the
 * engine produced them, so joining every segment's `text` reconstructs the
 * source exactly — multi-byte values included.
 */
const split = (text: string, replacements: Replacement[], range: Range): Segment[] => {
  const reps = [...replacements].sort((a, b) => range(a)[0] - range(b)[0]);
  const segs: Segment[] = [];
  let cursor = 0;
  for (const rep of reps) {
    const [start, end] = range(rep);
    if (start > cursor) segs.push({ kind: "text", text: text.slice(cursor, start) });
    segs.push({ kind: "mark", text: text.slice(start, end), rep });
    cursor = end;
  }
  if (cursor < text.length) segs.push({ kind: "text", text: text.slice(cursor) });
  return segs;
};

/** Splits scrubbed output into verbatim runs and the fakes that were written in. */
export const splitOutput = (output: string, replacements: Replacement[]): Segment[] =>
  split(output, replacements, (rep) => [rep.start, rep.end]);

/** Splits the pasted input the same way, around the values those fakes replaced. */
export const splitInput = (input: string, replacements: Replacement[]): Segment[] =>
  split(input, replacements, (rep) => [rep.sourceStart, rep.sourceEnd]);
