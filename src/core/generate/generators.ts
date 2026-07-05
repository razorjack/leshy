/**
 * TODO(opus): implementation-plan.md steps 9–10 — replace every todoGenerate()
 * in src/core/detect/detectors/ with a real generator. Binding rules
 * (docs/adr/0002, docs/adr/0004):
 *
 * person       seeded faker person name; pl locale when the source has Polish
 *              diacritics or appears in a Polish-address context, else en.
 *              Same word count as the source (first-only stays first-only).
 * email        local part from personSeed tokens when the local part is
 *              name-like (keeps person↔email linkage), else pseudoword; domain
 *              hash-derived; TLD is ALWAYS `.example` (RFC 2606 — idempotence).
 * phone        keep '+CC' prefix and the exact separator layout; replace the
 *              subscriber digits deterministically.
 * address      seeded faker address in the source locale's shape (pl: 'ul. X
 *              N/M, DD-DDD City' via fakerPL.location).
 * org          seeded faker company name, keep legal suffix ('Sp. z o.o.' …).
 * ip           public v4 → RFC 5737 TEST-NET (fake namespace); private v4
 *              (10/8, 172.16/12, 192.168/16) keeps its prefix, host bits
 *              hashed. v6 → 2001:db8::/32.
 * mac          locally-administered unicast (second hex digit 2/6/A/E).
 * credit-card  keep first digit (brand), hash middle, fix Luhn check digit.
 * iban         keep country code, hash BBAN, recompute mod-97 check digits.
 * jwt          three base64url pseudoword segments, structurally valid, never
 *              decodable.
 * api-key      keep the recognisable prefix, hash the tail, same length.
 * uuid         hash-derived v4-shaped.
 * ssn          area from hash (never 000/666/9xx), group ALWAYS '00' (never
 *              issued — fake namespace), serial from hash.
 * pesel        birth date in the 2100s band (month 41–52 — fake namespace),
 *              serial from hash, checksum recomputed. Keep encoded sex digit.
 *
 * All generators: output must not contain quotes, backslashes or newlines;
 * the engine reseeds via seedFor(`retry:${n}`) on violation or collision.
 */
export {};
