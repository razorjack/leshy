import type { Detector, Span } from "../types.ts";

export interface KeyValue {
  key: string;
  value: string;
  valueStart: number;
  valueEnd: number;
  quoted: boolean;
}

// One pass over the raw text finds key-value pairs across all supported
// syntaxes without parsing any of them:
//   "key": "v"   "key":42        JSON
//   key: "v"     key: 42         Ruby inspect / YAML-ish
//   :key => "v"  "key" => "v"    Ruby hash
//   key: 'v'                     JS object literal
//   key=v        key="v"         logfmt
//   ?key=v&key=v                 query string / cookie
// An unquoted value ends at the first separator of any of those syntaxes; `?`,
// `&` and `;` are in the set so a query string yields one pair per parameter:
// `scheme://host/path` reads as the pair `scheme=//host/path`, and without `?`
// that value would swallow the first parameter.
const KV =
  /(?::([A-Za-z_][A-Za-z0-9_]*)|["']([A-Za-z_][A-Za-z0-9_.-]*)["']|([A-Za-z_][A-Za-z0-9_.-]*))\s*(?:=>|:|=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s,;&?}\]"']+))/g;

const BARE_LITERAL = /^(?:null|nil|true|false|undefined)$/i;

export const scanKeyValues = (input: string): KeyValue[] => {
  const keyValues: KeyValue[] = [];
  for (const match of input.matchAll(KV)) {
    const key = match[1] ?? match[2] ?? match[3];
    const value = match[4] ?? match[5] ?? match[6];
    if (key === undefined || value === undefined || value === "") continue;
    const quoted = match[6] === undefined;
    const closingQuoteLength = quoted ? 1 : 0;
    const valueStart = match.index + match[0].length - value.length - closingQuoteLength;
    keyValues.push({ key, value, valueStart, valueEnd: valueStart + value.length, quoted });
  }
  return keyValues;
};

/** Values under PII-suggesting keys become key-context spans of that detector. */
export const detectByKey = (
  input: string,
  detectors: Detector[],
  keyValues = scanKeyValues(input),
): Span[] => {
  const spans: Span[] = [];
  const keyedDetectors = detectors.filter((detector) => detector.enabled && detector.keys);

  for (const keyValue of keyValues) {
    if (BARE_LITERAL.test(keyValue.value)) continue;
    const detector = keyedDetectors.find((candidate) => candidate.keys?.test(keyValue.key));
    if (!detector) continue;
    spans.push({
      start: keyValue.valueStart,
      end: keyValue.valueEnd,
      text: keyValue.value,
      type: detector.type,
      detector: detector.id,
      source: "key-context",
      score: 1,
    });
  }
  return spans;
};
