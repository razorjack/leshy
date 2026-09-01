import type { Replacement } from "../core/types.ts";

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "mark"; text: string; replacement: Replacement };

type ReplacementRange = (replacement: Replacement) => [start: number, end: number];

/**
 * Cuts text at the given replacement ranges. Offsets are UTF-16 indices as the
 * engine produced them, so joining every segment's `text` reconstructs the
 * source exactly — multi-byte values included.
 */
const split = (text: string, replacements: Replacement[], range: ReplacementRange): Segment[] => {
  const sortedReplacements = [...replacements].sort(
    (left, right) => range(left)[0] - range(right)[0],
  );
  const segments: Segment[] = [];
  let cursor = 0;
  for (const replacement of sortedReplacements) {
    const [start, end] = range(replacement);
    if (start > cursor) segments.push({ kind: "text", text: text.slice(cursor, start) });
    segments.push({ kind: "mark", text: text.slice(start, end), replacement });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments;
};

/** Splits scrubbed output into verbatim runs and the fakes that were written in. */
export const splitOutput = (output: string, replacements: Replacement[]): Segment[] =>
  split(output, replacements, (replacement) => [replacement.start, replacement.end]);

/** Splits the pasted input the same way, around the values those fakes replaced. */
export const splitInput = (input: string, replacements: Replacement[]): Segment[] =>
  split(input, replacements, (replacement) => [replacement.sourceStart, replacement.sourceEnd]);
