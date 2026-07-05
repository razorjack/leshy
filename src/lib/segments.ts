import type { Replacement } from "../core/types.ts";

export type Segment = { kind: "text"; text: string } | { kind: "mark"; rep: Replacement };

/**
 * Splits scrubbed output into verbatim text runs and replacement marks. Offsets
 * are output-coordinate UTF-16 indices (as the engine produced them), so the
 * concatenation of every segment reconstructs the output exactly — multi-byte
 * values included.
 */
export const splitOutput = (output: string, replacements: Replacement[]): Segment[] => {
  const reps = [...replacements].sort((a, b) => a.start - b.start);
  const segs: Segment[] = [];
  let cursor = 0;
  for (const rep of reps) {
    if (rep.start > cursor) segs.push({ kind: "text", text: output.slice(cursor, rep.start) });
    segs.push({ kind: "mark", rep });
    cursor = rep.end;
  }
  if (cursor < output.length) segs.push({ kind: "text", text: output.slice(cursor) });
  return segs;
};
