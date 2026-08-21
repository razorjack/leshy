import { describe, expect, it } from "vite-plus/test";
import { detect, scrub } from "../src/core/engine.ts";
import { resolveConfig } from "../src/core/config.ts";
import { scanKeyValues } from "../src/core/detect/keyContext.ts";
import type { Span } from "../src/core/types.ts";
import { samples } from "./fixtures/samples.ts";

const config = resolveConfig();

const covered = (spans: Span[], input: string, text: string): boolean => {
  const start = input.indexOf(text);
  const end = start + text.length;
  const marks = Array.from({ length: text.length }, () => false);
  for (const s of spans) {
    for (let i = Math.max(s.start, start); i < Math.min(s.end, end); i++) marks[i - start] = true;
  }
  return start >= 0 && marks.every(Boolean);
};

const touched = (spans: Span[], input: string, text: string): boolean => {
  const start = input.indexOf(text);
  const end = start + text.length;
  return spans.some((s) => s.start < end && s.end > start);
};

describe("detection without the model (structural + key-context)", () => {
  for (const sample of samples) {
    it(`handles ${sample.name}`, async () => {
      const spans = await detect(sample.input, { config });
      for (const g of sample.gold) {
        if (g.expect === "catch") {
          expect(covered(spans, sample.input, g.text), `should catch ${g.text}`).toBe(true);
        } else {
          expect(touched(spans, sample.input, g.text), `should preserve ${g.text}`).toBe(false);
        }
      }
    });
  }
});

describe("resolve stage", () => {
  const semanticSpan = (input: string, text: string, type: string, score = 0.9): Span => {
    const start = input.indexOf(text);
    return {
      start,
      end: start + text.length,
      text,
      type,
      detector: type,
      source: "semantic",
      score,
    };
  };

  it("redacts a checksummed PESEL even under an id-like key (recall first)", async () => {
    const input = '{"id":"44051401359"}';
    const spans = await detect(input, { config });
    expect(covered(spans, input, "44051401359")).toBe(true);
  });

  it("suppresses semantic hits on ids under preserve keys", async () => {
    const input = 'user_id=98123 msg="ok"';
    const semantic = (s: string) => Promise.resolve([semanticSpan(s, "98123", "person")]);
    const spans = await detect(input, { config, semantic });
    expect(touched(spans, input, "98123")).toBe(false);
  });

  it("drops uncorroborated semantic hits of machine-checkable types", async () => {
    const input = "level=info marker=xyzzy";
    const semantic = (s: string) => Promise.resolve([semanticSpan(s, "xyzzy", "email")]);
    const spans = await detect(input, { config, semantic });
    expect(touched(spans, input, "xyzzy")).toBe(false);
  });

  it("merges adjacent semantic address fragments across short glue", async () => {
    const input = "moved to ul. Marszałkowska 1, 00-624 Warszawa yesterday";
    const semantic = (s: string) =>
      Promise.resolve([
        semanticSpan(s, "ul. Marszałkowska", "address"),
        semanticSpan(s, "00-624", "address"),
        semanticSpan(s, "Warszawa", "address"),
      ]);
    const spans = await detect(input, { config, semantic });
    expect(covered(spans, input, "ul. Marszałkowska 1, 00-624 Warszawa")).toBe(true);
  });

  it("never lets a shorter winner shrink coverage (losers are trimmed)", async () => {
    const input = "contact Jan Kowalski jr";
    const semantic = (s: string) =>
      Promise.resolve([
        semanticSpan(s, "Jan", "person", 0.95),
        semanticSpan(s, "Jan Kowalski jr", "person", 0.9),
      ]);
    const spans = await detect(input, { config, semantic });
    expect(covered(spans, input, "Jan Kowalski jr")).toBe(true);
  });

  it("preserves values from Leshy fake namespaces (idempotence)", async () => {
    const input =
      '{"email":"mossy.stone@fern.example","ip":"203.0.113.7","ssn":"912-00-3456","backup":"198.51.100.20"}';
    const spans = await detect(input, { config });
    expect(spans).toHaveLength(0);
  });

  it("merges a same-type span pair into one replacement, not two", async () => {
    // structural email (tier 300) sits inside the key-context span for the
    // whole value (tier 200); trimming alone would fake the remainder too
    const input = '{"email":"foo@bar.com/extra"}';
    const spans = await detect(input, { config });
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe("foo@bar.com/extra");
    const { replacements } = await scrub(input, { config });
    expect(replacements).toHaveLength(1);
  });

  it("keeps timestamps out of results even when tagged by the model", async () => {
    const input = "seen 2024-01-02T10:00:00Z at gate";
    const semantic = (s: string) =>
      Promise.resolve([semanticSpan(s, "2024-01-02T10:00:00Z", "address")]);
    const spans = await detect(input, { config, semantic });
    expect(touched(spans, input, "2024-01-02T10:00:00Z")).toBe(false);
  });
});

describe("key-value scanner", () => {
  it("ends an unquoted value at a query-string or cookie separator", () => {
    const kvs = scanKeyValues("GET /users?email=jan@corp.com&token=abc HTTP/1.1");
    expect(kvs.map((kv) => [kv.key, kv.value])).toEqual([
      ["email", "jan@corp.com"],
      ["token", "abc"],
    ]);
    const cookie = scanKeyValues("Cookie: session=abc123; user_email=jan@corp.com");
    expect(cookie.map((kv) => kv.value)).toContain("jan@corp.com");
    expect(cookie.every((kv) => !kv.value.includes(";"))).toBe(true);
  });

  it("keeps the surrounding structure intact when scrubbing a query string", async () => {
    const input = "GET /users?email=jan@corp.com&token=abc HTTP/1.1";
    const { output } = await scrub(input, { config });
    expect(output).toContain("&token=");
    expect(output).not.toContain("jan@corp.com");
    expect(output.startsWith("GET /users?email=")).toBe(true);
    expect(output.endsWith(" HTTP/1.1")).toBe(true);
  });
});
