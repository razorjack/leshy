import { describe, expect, it } from "vite-plus/test";
import { fakerFor, localeFor } from "../src/core/generate/faker.ts";
import { locales } from "../src/core/generate/locales.ts";

describe("fakerFor", () => {
  it("is deterministic: same seed ⇒ identical values", () => {
    const a = fakerFor(12345, "en");
    const b = fakerFor(12345, "en");
    expect(a.person.fullName()).toBe(b.person.fullName());
    expect(a.internet.username()).toBe(b.internet.username());
  });

  it("uses the pl locale (Polish DD-DDD postcodes) when asked", () => {
    expect(fakerFor(42, "pl").location.zipCode()).toMatch(/^\d{2}-\d{3}$/);
    expect(fakerFor(42, "en").location.zipCode()).toMatch(/^\d{5}/);
  });
});

describe("localeFor", () => {
  it("picks pl for Polish diacritics in the value", () => {
    expect(localeFor("Łukasz")).toBe("pl");
    expect(localeFor("Zażółć")).toBe("pl");
  });

  it("picks pl for a Polish-address shape", () => {
    expect(localeFor("ul. Piekna 12/4, 00-001 Warszawa")).toBe("pl");
    expect(localeFor("00-624")).toBe("pl");
  });

  it("picks en otherwise", () => {
    expect(localeFor("John Smith")).toBe("en");
    expect(localeFor("just a plain sentence")).toBe("en");
  });

  it("reaches every shipped locale by name", () => {
    for (const id of locales) expect(fakerFor(7, id).person.firstName()).toBeTruthy();
    expect(locales.length).toBeGreaterThan(2);
  });
});
