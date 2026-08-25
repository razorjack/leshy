import { describe, expect, it } from "vite-plus/test";
import { scrub } from "../src/core/engine.ts";
import { resolveConfig } from "../src/core/config.ts";
import type { ScrubResult } from "../src/core/types.ts";
import { samples } from "./fixtures/samples.ts";

const config = resolveConfig();

// Default-salt golden outputs, structural + key-context only (no model).
const golden: Record<string, string> = {
  "json-nested":
    '{"user":{"id":42,"email":"shelley.stiedemann@frivolous-safe.example","full_name":"Shelley Stiedemann","phone":"+48 222 070 920","address":"rondo Kozłowski 50c, 67-893 Giżycko","pesel":"29410462712"}}',
  "ruby-inspect":
    '#<User id: 42, email: "shelley.stiedemann@frivolous-safe.example", first_name: "Logan", last_name: "Joany", created_at: "2024-01-02 10:00:00 +0100">',
  "ruby-hash":
    '{ :email => "norma.morissette@stale-cardboard.example", "name" => "Norma Morissette", :ip => "10.128.231.48" }',
  "js-objects":
    "[ { name: 'Faith Casper', email: 'trevor@jagged-partridge.example', ssn: '812-00-0293' } ]",
  logfmt:
    '2024-01-02T10:00:00Z level=info user_email=elsa@torn-vibration.example user_id=98123 msg="login ok"',
  "http-secrets":
    'POST /login upstream=postgres://sduoxkp:gy6cf9aaa@db.internal:5432/app authorization="Bearer 6h9r8t4f6t7i" cookie="sessionid=5d6n9e2p3b; theme=idwy" password="gyweoa4" user_id=98123',
  "de-json":
    '{"kunde":{"name":"Alessa Golomski","adresse":"Stüttekofener Str. 67a, 36781 Ost Jolina","steuer_id":"05197834327","email":"amya.corkery@nocturnal-digestive.example"}}',
};

/** Bytes outside replaced spans must equal the input, byte for byte (adr/0003). */
const assertByteFidelity = (input: string, r: ScrubResult): void => {
  let si = 0;
  let so = 0;
  for (const rep of r.replacements) {
    expect(r.output.slice(so, rep.start)).toBe(input.slice(si, rep.sourceStart));
    expect(r.output.slice(rep.start, rep.end)).toBe(rep.fake);
    si = rep.sourceEnd;
    so = rep.end;
  }
  expect(r.output.slice(so)).toBe(input.slice(si));
};

describe("scrub — golden outputs (default salt)", () => {
  for (const sample of samples) {
    it(`scrubs ${sample.name} to the committed golden`, async () => {
      const r = await scrub(sample.input, { config });
      expect(r.output).toBe(golden[sample.name]);
      assertByteFidelity(sample.input, r);
      // gold `catch` texts must not survive verbatim
      for (const g of sample.gold) {
        if (g.expect === "catch") expect(r.output).not.toContain(g.text);
      }
    });
  }

  it("keeps JSON parseable", async () => {
    const r = await scrub(samples[0]!.input, { config });
    expect(() => JSON.parse(r.output)).not.toThrow();
  });
});

describe("scrub — idempotence (structured, namespace-fixed content)", () => {
  it("re-scrubbing an email-only sample changes nothing", async () => {
    const once = await scrub(samples[4]!.input, { config }); // logfmt
    const twice = await scrub(once.output, { config });
    expect(twice.output).toBe(once.output);
  });

  it("re-scrubbing structured types (email, ip, ssn, pesel, mac) changes nothing", async () => {
    const input =
      'email=jan@corp.com ip=8.8.8.8 ssn=123-45-6789 pesel=44051401359 steuer_id=86095742719 mac="00:1B:44:11:3A:B7"';
    const once = await scrub(input, { config });
    const twice = await scrub(once.output, { config });
    expect(twice.output).toBe(once.output);
  });
});

describe("scrub — consistency (same value ⇒ same fake)", () => {
  it("holds within one input and across inputs", async () => {
    const a = await scrub('a: "jan.kowalski@gmail.com", b: "jan.kowalski@gmail.com"', { config });
    expect(a.replacements).toHaveLength(2);
    expect(a.replacements[0]!.fake).toBe(a.replacements[1]!.fake);

    const b = await scrub("mail jan.kowalski@gmail.com now", { config });
    const emailFake = b.replacements.find((r) => r.type === "email")!.fake;
    expect(emailFake).toBe(a.replacements[0]!.fake);
  });
});
