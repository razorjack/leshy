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
const KV =
  /(?::([A-Za-z_][A-Za-z0-9_]*)|["']([A-Za-z_][A-Za-z0-9_.-]*)["']|([A-Za-z_][A-Za-z0-9_.-]*))\s*(?:=>|:|=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s,}\]"']+))/g;

const BARE_LITERAL = /^(?:null|nil|true|false|undefined)$/i;

export const scanKeyValues = (input: string): KeyValue[] => {
  const out: KeyValue[] = [];
  for (const m of input.matchAll(KV)) {
    const key = m[1] ?? m[2] ?? m[3];
    const value = m[4] ?? m[5] ?? m[6];
    if (key === undefined || value === undefined || value === "") continue;
    const quoted = m[6] === undefined;
    const valueStart = m.index + m[0].length - value.length - (quoted ? 1 : 0);
    out.push({ key, value, valueStart, valueEnd: valueStart + value.length, quoted });
  }
  return out;
};

/** Values under PII-suggesting keys become key-context spans of that detector. */
export const detectByKey = (input: string, detectors: Detector[], kvs?: KeyValue[]): Span[] => {
  const spans: Span[] = [];
  const keyed = detectors.filter((d) => d.enabled && d.keys);
  for (const kv of kvs ?? scanKeyValues(input)) {
    if (BARE_LITERAL.test(kv.value)) continue;
    const detector = keyed.find((d) => d.keys?.test(kv.key));
    if (!detector) continue;
    spans.push({
      start: kv.valueStart,
      end: kv.valueEnd,
      text: kv.value,
      type: detector.type,
      detector: detector.id,
      source: "key-context",
      score: 1,
    });
  }
  return spans;
};
