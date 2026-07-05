import { describe, expect, it } from "vite-plus/test";
import { detectStructural } from "../src/core/detect/structural.ts";
import { builtins } from "../src/core/detect/detectors/index.ts";
import { peselChecksum, isFakePesel } from "../src/core/detect/detectors/pesel.ts";

const types = (input: string): string[] =>
  [...new Set(detectStructural(input, builtins).map((s) => s.type))].sort();

describe("structural detectors", () => {
  it("matches emails", () => {
    expect(types("contact: jan.kowalski+dev@sub.gmail.com")).toContain("email");
  });

  it("matches international and grouped phones, not timestamps", () => {
    expect(types("call +48 601 234 567")).toContain("phone");
    expect(types("call +14155552671")).toContain("phone");
    expect(types("at 2024-01-02 10:00:00 +0100")).not.toContain("phone");
    expect(types("user_id=98123")).not.toContain("phone");
  });

  it("matches IPv4 and IPv6", () => {
    expect(types("from 10.0.0.5")).toContain("ip");
    expect(types("from 2001:0db8:85a3::8a2e:0370:7334")).toContain("ip");
    expect(types("version 1.2.3.4.5")).not.toContain("ip");
  });

  it("matches MAC addresses", () => {
    expect(types("nic 00:1B:44:11:3A:B7 up")).toContain("mac");
  });

  it("validates credit cards with Luhn", () => {
    expect(types("pan 4111 1111 1111 1111")).toContain("credit-card");
    expect(types("pan 4111 1111 1111 1112")).not.toContain("credit-card");
  });

  it("validates IBAN mod-97", () => {
    expect(types("iban DE89370400440532013000")).toContain("iban");
    expect(types("iban DE89370400440532013001")).not.toContain("iban");
  });

  it("matches JWTs and known API key shapes", () => {
    expect(
      types(
        "auth eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9P",
      ),
    ).toContain("jwt");
    expect(types("key AKIAIOSFODNN7REALKEY")).toContain("api-key");
    expect(types("key ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8")).toContain("api-key");
  });

  it("validates SSN issuance rules", () => {
    expect(types("ssn 123-45-6789")).toContain("ssn");
    expect(types("ssn 000-45-6789")).not.toContain("ssn");
    expect(types("ssn 666-45-6789")).not.toContain("ssn");
  });

  it("validates PESEL checksum and encoded date", () => {
    expect(peselChecksum("44051401359")).toBe(true);
    expect(types("pesel 44051401359")).toContain("pesel");
    expect(types("pesel 44051401358")).not.toContain("pesel");
    expect(types("pesel 44131401350")).not.toContain("pesel");
  });

  it("keeps UUIDs off by default", () => {
    expect(types("id 123e4567-e89b-12d3-a456-426614174000")).not.toContain("uuid");
  });

  it("catches Polish street addresses without the model", () => {
    expect(types("mieszka przy ul. Piękna 12/4, 00-001 Warszawa")).toContain("address");
  });
});

describe("fake namespaces (idempotence)", () => {
  it("recognises Leshy-generated PESELs by their 2100s date band", () => {
    // month 45 = May 2144; checksum-valid by construction
    const digits = "44451401356";
    const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
    const check = (10 - (sum % 10)) % 10;
    const fake = digits.slice(0, 10) + String(check);
    expect(isFakePesel(fake)).toBe(true);
    expect(isFakePesel("44051401359")).toBe(false);
  });
});
