import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// Candidates: "+" international form, or separator-grouped digit runs.
// The validator enforces plausible digit counts and rejects date/time shapes,
// the classic false positive in debugging output.
export const phone: StructuralDetector = {
  id: "phone",
  label: "Phone number",
  type: "phone",
  kind: "structural",
  enabled: true,
  match:
    /(?<![\d/.-])(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d{2,4}(?:[ .-]\d{2,4}){1,4}(?![\d/.-])|(?<![\d/.:-])\+\d{7,15}(?![\d/.:-])/g,
  keys: /phone|mobile|cell|(?:^|_)tel(?:$|_)/i,
  // Digit counts and date/time shapes only make a candidate plausible, so a
  // match does not outrank preserve rules — a grouped `trace_id` stays put.
  heuristic: true,
  validate: (text, input, start) => {
    const digits = text.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) return false;
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return false;
    return !/\d:\d/.test(input.slice(Math.max(0, start - 1), start + text.length + 1));
  },
  generate: generators.phone,
};
