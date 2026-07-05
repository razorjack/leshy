import { describe, expect, it } from "vite-plus/test";
import { makeContext } from "../src/core/generate/context.ts";
import { generators } from "../src/core/generate/generators.ts";
import { detect } from "../src/core/engine.ts";
import { resolveConfig } from "../src/core/config.ts";
import type { EntityType } from "../src/core/types.ts";

const config = resolveConfig();
const SALT = "leshy-v1";

type GenKey = keyof typeof generators;

const fakeOf = async (gen: GenKey, original: string, type: EntityType): Promise<string> => {
  const ctx = await makeContext(original, type, SALT);
  return generators[gen](ctx);
};

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
