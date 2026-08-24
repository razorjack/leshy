import { describe, expect, it } from "vite-plus/test";
import { makeContext } from "../src/core/generate/context.ts";
import { generators } from "../src/core/generate/generators.ts";
import { detect, scrub } from "../src/core/engine.ts";
import { resolveConfig } from "../src/core/config.ts";
import { creditCard } from "../src/core/detect/detectors/creditCard.ts";
import { iban } from "../src/core/detect/detectors/iban.ts";
import { phone } from "../src/core/detect/detectors/phone.ts";
import type { EntityType, LocaleSetting } from "../src/core/types.ts";
import { locales } from "../src/core/generate/locales.ts";

const config = resolveConfig();
const SALT = "leshy-v1";

type GenKey = keyof typeof generators;

const fakeOf = async (gen: GenKey, original: string, type: EntityType): Promise<string> => {
  const ctx = await makeContext(original, type, SALT);
  return generators[gen](ctx);
};

const fakeIn = async (
  gen: GenKey,
  original: string,
  type: EntityType,
  locale: LocaleSetting,
): Promise<string> => generators[gen](await makeContext(original, type, SALT, locale));

const spanCount = async (text: string): Promise<number> => (await detect(text, { config })).length;

describe("structured generators — namespace membership & idempotence", () => {
  it("email: .example TLD, linked local part, re-detects to nothing", async () => {
    const fake = await fakeOf("email", "jan.kowalski@gmail.com", "email");
    expect(fake).toMatch(/^[a-z0-9._+-]+@[a-z0-9-]+\.example$/);
    expect(await spanCount(fake)).toBe(0);
  });

  it("public IPv4 → RFC 5737 TEST-NET, re-detects to nothing", async () => {
    const fake = await fakeOf("ipv4", "8.8.8.8", "ip");
    expect(fake).toMatch(/^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/);
    expect(await spanCount(fake)).toBe(0);
  });

  it("private IPv4 keeps its prefix, hashes host bits", async () => {
    expect(await fakeOf("ipv4", "10.0.0.5", "ip")).toMatch(/^10\.\d+\.\d+\.\d+$/);
    expect(await fakeOf("ipv4", "192.168.1.100", "ip")).toMatch(/^192\.168\.\d+\.\d+$/);
    expect(await fakeOf("ipv4", "172.16.5.9", "ip")).toMatch(/^172\.16\.\d+\.\d+$/);
  });

  it("IPv6 → 2001:db8::/32, re-detects to nothing", async () => {
    const fake = await fakeOf("ipv6", "2001:0db8:85a3::8a2e:0370:7334", "ip");
    expect(fake).toMatch(/^2001:db8(?::[0-9a-f]{1,4}){6}$/);
    expect(await spanCount(fake)).toBe(0);
  });

  it("MAC → locally-administered unicast, re-detects to nothing", async () => {
    const fake = await fakeOf("mac", "00:1B:44:11:3A:B7", "mac");
    expect(fake).toMatch(/^[0-9A-F][26AE](?::[0-9A-F]{2}){5}$/);
    expect(await spanCount(fake)).toBe(0);
  });

  it("SSN → group 00 (never issued), re-detects to nothing", async () => {
    const fake = await fakeOf("ssn", "123-45-6789", "ssn");
    expect(fake).toMatch(/^\d{3}-00-\d{4}$/);
    expect(await spanCount(fake)).toBe(0);
  });

  it("PESEL → 2100s band, checksum valid, keeps sex parity, re-detects to nothing", async () => {
    const fake = await fakeOf("pesel", "44051401359", "pesel");
    expect(fake).toMatch(/^\d{11}$/);
    expect(Number(fake.slice(2, 4))).toBeGreaterThanOrEqual(41);
    expect(Number(fake.slice(2, 4))).toBeLessThanOrEqual(52);
    // source sex digit (index 9) is odd (9) → fake's must be odd too
    expect(Number(fake[9]) % 2).toBe(1);
    expect(await spanCount(fake)).toBe(0);
  });
});

describe("structured generators — determinism (fixed salt ⇒ exact strings)", () => {
  const golden: Array<[GenKey, string, EntityType, string]> = [
    ["email", "jan.kowalski@gmail.com", "email", "shelley.stiedemann@frivolous-safe.example"],
    ["ipv4", "8.8.8.8", "ip", "203.0.113.185"],
    ["ipv4", "10.0.0.5", "ip", "10.128.231.48"],
    ["ipv6", "2001:0db8:85a3::8a2e:0370:7334", "ip", "2001:db8:c0eb:ef6b:0ed7:a6db:d4af:da13"],
    ["mac", "00:1B:44:11:3A:B7", "mac", "B6:BD:6F:F4:17:2E"],
    ["ssn", "123-45-6789", "ssn", "812-00-0293"],
    ["pesel", "44051401359", "pesel", "29410462712"],
  ];

  for (const [gen, original, type, expected] of golden) {
    it(`${gen}(${original}) === ${expected}`, async () => {
      expect(await fakeOf(gen, original, type)).toBe(expected);
      // same input twice ⇒ same fake
      expect(await fakeOf(gen, original, type)).toBe(expected);
    });
  }
});

describe("shape-preserving digit generators", () => {
  it("phone keeps +CC and the separator layout, replaces subscriber digits", async () => {
    const fake = await fakeOf("phone", "+48 601 234 567", "phone");
    expect(fake).toMatch(/^\+48 \d{3} \d{3} \d{3}$/);
    expect(fake).not.toBe("+48 601 234 567");
    expect(phone.validate!(fake, fake, 0)).toBe(true);
    expect(await fakeOf("phone", "+1 (415) 555-2671", "phone")).toMatch(
      /^\+1 \(\d{3}\) \d{3}-\d{4}$/,
    );
  });

  it("phone replaces separator-less numbers instead of echoing them", async () => {
    for (const src of ["+14155552671", "+48601234567"]) {
      const fake = await fakeOf("phone", src, "phone");
      expect(fake).not.toBe(src);
      expect(fake).toHaveLength(src.length);
      expect(fake.slice(0, 2)).toBe(src.slice(0, 2)); // '+' and the country code
    }
    const scrubbed = await scrub('{"phone":"+14155552671"}', { config });
    expect(scrubbed.output).not.toContain("+14155552671");
  });

  it("credit-card keeps the brand digit, fixes Luhn, preserves layout", async () => {
    const fake = await fakeOf("credit-card", "4111 1111 1111 1111", "credit-card");
    expect(fake).toMatch(/^4\d{3} \d{4} \d{4} \d{4}$/);
    expect(creditCard.validate!(fake, fake, 0)).toBe(true);
  });

  it("iban keeps the country code, recomputes mod-97", async () => {
    const fake = await fakeOf("iban", "DE89370400440532013000", "iban");
    expect(fake.slice(0, 2)).toBe("DE");
    expect(fake).toHaveLength(22);
    expect(iban.validate!(fake, fake, 0)).toBe(true);
    const pl = await fakeOf("iban", "PL61109010140000071219812874", "iban");
    expect(pl.slice(0, 2)).toBe("PL");
    expect(iban.validate!(pl, pl, 0)).toBe(true);
  });

  it("jwt is three base64url segments of the source lengths", async () => {
    const src = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9P";
    const fake = await fakeOf("jwt", src, "jwt");
    const parts = fake.split(".");
    expect(parts).toHaveLength(3);
    parts.forEach((p, i) => {
      expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(p.length).toBe(src.split(".")[i]!.length);
    });
  });

  it("api-key keeps the prefix and length, hashes the tail", async () => {
    const fake = await fakeOf("api-key", "AKIAIOSFODNN7REALKEY", "api-key");
    expect(fake).toMatch(/^AKIA[0-9A-Z]{16}$/);
    expect(fake).toHaveLength("AKIAIOSFODNN7REALKEY".length);
    expect(await fakeOf("api-key", "ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8", "api-key")).toMatch(
      /^ghp_[A-Za-z0-9]{36}$/,
    );
  });

  it("api-key keeps no leading characters of a secret with no known prefix", async () => {
    for (const src of ["hunter2SuperSecret", "MyPrivateKeyValue123"]) {
      const fake = await fakeOf("api-key", src, "api-key");
      expect(fake).toHaveLength(src.length);
      expect(fake.slice(0, 4)).not.toBe(src.slice(0, 4));
    }
  });

  it("uuid is v4-shaped", async () => {
    const fake = await fakeOf("uuid", "123e4567-e89b-12d3-a456-426614174000", "uuid");
    expect(fake).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("digit generators are deterministic (fixed salt ⇒ exact strings)", async () => {
    expect(await fakeOf("phone", "+48 601 234 567", "phone")).toBe("+48 252 220 709");
    expect(await fakeOf("credit-card", "4111 1111 1111 1111", "credit-card")).toBe(
      "4378 1130 5910 0583",
    );
    expect(await fakeOf("iban", "DE89370400440532013000", "iban")).toBe("DE33101951368393958953");
    expect(await fakeOf("api-key", "AKIAIOSFODNN7REALKEY", "api-key")).toBe("AKIAKXDKHTTE4QLNIDIE");
    expect(await fakeOf("uuid", "123e4567-e89b-12d3-a456-426614174000", "uuid")).toBe(
      "e8b8ae9e-c2c9-481f-9bc9-9f43e9a037b1",
    );
  });
});

describe("semantic generators", () => {
  const wc = (s: string): number => s.split(/\s+/).filter(Boolean).length;

  it("person preserves word count and casing", async () => {
    expect(wc(await fakeOf("person", "Jan", "person"))).toBe(1);
    expect(wc(await fakeOf("person", "Jan Kowalski", "person"))).toBe(2);
    expect(wc(await fakeOf("person", "Anna Maria Nowak", "person"))).toBe(3);
    const upper = await fakeOf("person", "JAN KOWALSKI", "person");
    expect(upper).toBe(upper.toUpperCase());
  });

  it("address uses the pl shape in Polish contexts, en shape otherwise", async () => {
    const pl = await fakeOf("address", "ul. Piękna 12/4, 00-001 Warszawa", "address");
    expect(pl).toMatch(/,\s\d{2}-\d{3}\s/); // DD-DDD postcode
    const en = await fakeOf("address", "123 Main Street, Springfield", "address");
    expect(en).not.toMatch(/\d{2}-\d{3}/);
  });

  it("address components stay their own kind under component keys", async () => {
    const { output } = await scrub('{"street":"Main St","city":"Warszawa","zip":"00-624"}', {
      config,
    });
    const parsed = JSON.parse(output) as Record<string, string>;
    expect(parsed["street"]).not.toContain(",");
    expect(parsed["city"]).not.toMatch(/\d/);
    expect(parsed["zip"]).toMatch(/^\d{2}-\d{3}$/);
    expect(Object.values(parsed)).not.toContain("Warszawa");
  });

  it("postcode keeps the source shape whatever the country", async () => {
    expect(await fakeOf("postcode", "SW1A 1AA", "postcode")).toMatch(
      /^[A-Z]{2}\d[A-Z] \d[A-Z]{2}$/,
    );
    expect(await fakeOf("postcode", "97477-1234", "postcode")).toMatch(/^\d{5}-\d{4}$/);
    expect(await fakeOf("postcode", "00-624", "postcode")).toMatch(/^\d{2}-\d{3}$/);
  });

  it("org keeps the legal suffix verbatim, fakes the name", async () => {
    const pl = await fakeOf("org", "Acme Sp. z o.o.", "org");
    expect(pl.endsWith("Sp. z o.o.")).toBe(true);
    expect(pl).not.toContain("Acme");
    expect((await fakeOf("org", "Beispiel GmbH", "org")).endsWith("GmbH")).toBe(true);
    expect((await fakeOf("org", "Widgets Inc.", "org")).endsWith("Inc.")).toBe(true);
  });

  it("org keeps suffixes from any shipped locale, not just pl and en", async () => {
    for (const [src, suffix] of [
      ["Société Générale SA", "SA"],
      ["Bouwbedrijf B.V.", "B.V."],
      ["Fiat S.p.A.", "S.p.A."],
      ["Telia AB", "AB"],
      ["Seznam s.r.o.", "s.r.o."],
      ["Padaria Ltda.", "Ltda."],
    ] as const) {
      const fake = await fakeOf("org", src, "org");
      expect(fake.endsWith(` ${suffix}`)).toBe(true);
      expect(fake).not.toBe(src);
    }
  });

  it("address follows the locale's layout", async () => {
    const src = "1 Main St, Springfield, IL 62704";
    expect(await fakeIn("address", src, "address", "de")).toMatch(/, \d{5} \D+$/);
    expect(await fakeIn("address", src, "address", "en")).toMatch(/, [A-Z]{2} \d{5}/);
    expect(await fakeIn("address", src, "address", "en_GB")).not.toMatch(/, [A-Z]{2} \d/);
  });

  it("every shipped locale generates a full address", async () => {
    for (const id of locales) {
      const fake = await fakeIn("address", "1 Main St", "address", id);
      expect(fake).toContain(",");
    }
  });

  it("links a person to their email (same personSeed ⇒ shared first/last)", async () => {
    const person = await fakeOf("person", "Jan Kowalski", "person");
    const emailLocal = (await fakeOf("email", "jan.kowalski@gmail.com", "email")).split("@")[0]!;
    const [first, last] = person.toLowerCase().split(" ");
    expect(emailLocal).toContain(first!);
    expect(emailLocal).toContain(last!);
  });

  it("links a person to their email in a pl locale too", async () => {
    // same personSeed, so the locale must resolve the same on both sides
    const person = await fakeOf("person", "\u0141ukasz Nowak", "person");
    const emailLocal = (await fakeOf("email", "\u0142ukasz.nowak@x.com", "email")).split("@")[0]!;
    const [first, last] = person.toLowerCase().split(" ");
    expect(emailLocal).toBe(`${first}.${last}`);
  });

  it("an explicit locale overrides the per-value sniff", async () => {
    expect(await fakeIn("person", "Jan Kowalski", "person", "de")).not.toBe(
      await fakeOf("person", "Jan Kowalski", "person"),
    );
    // an en-looking source still yields the Polish `street, DD-DDD City` order
    expect(await fakeIn("address", "1 Main St, Springfield, IL 62704", "address", "pl")).toMatch(
      /, \d{2}-\d{3} /,
    );
  });

  it("an explicit locale keeps a person linked to their email", async () => {
    const person = await fakeIn("person", "Jan Kowalski", "person", "de");
    const local = (await fakeIn("email", "jan.kowalski@corp.com", "email", "de")).split("@")[0];
    expect(local).toBe(
      person
        .replace(" ", ".")
        .toLowerCase()
        .replace(/[^a-z0-9._+-]/g, ""),
    );
  });

  it("config locale drives a whole scrub, deterministically", async () => {
    const input = '{"full_name":"Jan Kowalski"}';
    const pl = resolveConfig({ locale: "pl" });
    const out = (await scrub(input, { config: pl })).output;
    expect(out).not.toBe((await scrub(input, { config })).output);
    expect((await scrub(input, { config: pl })).output).toBe(out);
  });

  it("is deterministic (fixed salt ⇒ exact strings)", async () => {
    expect(await fakeOf("person", "Jan Kowalski", "person")).toBe("Shelley Stiedemann");
    expect(await fakeOf("org", "Acme Sp. z o.o.", "org")).toBe(
      "Simonis, Skiles and Gusikowski Sp. z o.o.",
    );
  });
});
