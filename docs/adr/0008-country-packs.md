# ADR-0008: Country packs — locale-specific rules are selected, not assumed

Status: accepted

## Context

Leshy started with PESEL, a Polish street-address grammar and US SSN in the same
always-on detector list as email, IBAN and IP. That list is the whole of what a user
gets: there was no way to say "this is a German log" and no place to put a Steuer-ID,
NINO, DNI or codice fiscale that would not make every other user carry it.

Two things were tangled in one array. `email`, `iban`, `credit-card`, `ip`, `mac`, `jwt`
and `api-key` describe formats that mean the same thing everywhere. `pesel` and
`pl-address` describe one country's paperwork, and the only reason they were unconditional
is that Leshy was written in Poland.

## Decision

A **country pack** groups the detectors that only make sense inside one country's
documents. `src/core/packs/<id>/` holds them, `src/core/packs/index.ts` lists the packs,
and `config.countries` selects them by ISO 3166-1 alpha-2 id:

```ts
export default defineConfig({ countries: ["pl", "de"] });
```

- **All packs load by default.** An unexpected national id over-scrubs; a missing one
  leaks (recall first, ADR-0004). Narrowing the list is an explicit choice by someone who
  knows their data.
- **Pack detectors come first** in the resolved detector list. Declaration order breaks
  equal-tier ties, and a national-id checksum is the most specific rule Leshy has.
- **Country-neutral detectors are never in a pack.** `src/core/detect/detectors/` is
  exactly the set that means the same thing in every country, including the address
  components (`street`, `city`, `postcode`) that are recognised by their field name.
- **A pack is self-contained**: its detectors, their generators and the preserve rule for
  the fake namespace they draw from all live in `packs/<id>/`. `generate/generators.ts`
  keeps the country-neutral types, and `generate/shape.ts` holds the few helpers both
  sides use. The locale a fake is written in stays a separate setting (ADR-0002): a pack
  names the locale that pairs with it so the UI can offer the two together, but a German
  document may be scrubbed into English fakes if that is what the user wants.
- **Per-detector toggles still work.** Pack detectors go through the same `disable` /
  `enable` lists as the built-ins, so `countries` is a coarse dial over a fine one.

Polish stays first-class: `pl` is the reference pack, the one the spike samples exercise,
and the one whose address grammar proves that a structural safety net under the model is
worth having. It is no longer the only one that gets that treatment.

## Consequences

- Adding a country is a directory and one line in `packs/index.ts`. It needs no change to
  the engine, the resolver or the config shape.
- Moving the PESEL generator next to the PESEL detector also removed the copy of the
  checksum weights that the two files had been keeping in sync.
- `resolveConfig().countries` reports the selected ids, which the settings dialog renders
  as one switch per country. Deselecting one removes its detectors from the list below it,
  so the Detectors section shows what is actually running instead of every rule Leshy
  ships — no "PESEL" switch for a user in São Paulo.
- A pack's fake-namespace preserve rule travels with it, so `core/preserve.ts` holds only
  country-neutral rules and idempotence is a pack-local property: deselect `pl` and both
  the PESEL detector and the rule that recognises Leshy's own PESELs go at once.
- Everything loading by default means the detector list grows with each pack, and with it
  the false-positive surface. That is the trade the recall-first invariant already makes.
