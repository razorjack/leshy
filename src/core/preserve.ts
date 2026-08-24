import type { PreserveRule } from "./types.ts";

const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|\s?[+-]\d{2}:?\d{2})?)?$/;

// RFC 5737 TEST-NET ranges — Leshy's fake namespace for public IPv4s.
const TEST_NET = /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/;

// RFC 2606 reserved TLD — Leshy's fake namespace for emails and hostnames.
const EXAMPLE_TLD = /\.example$/i;

// RFC 3849 documentation prefix — Leshy's fake namespace for IPv6.
const DOC_IPV6 = /^2001:0*db8:/i;

// Locally-administered unicast (second nibble 2/6/A/E) — Leshy's fake MAC band.
const FAKE_MAC = /^[0-9A-Fa-f][26AEae]([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}$/;

/**
 * Country-neutral preserve rules; a country pack contributes its own
 * (src/core/packs, adr/0008). `db-ids` and `timestamps` protect debugging value
 * (TIER.PRESERVE_RULE — a validated checksum still beats them). The `fake-*`
 * rules make scrubbing idempotent (TIER.PRESERVE_FAKE): Leshy's own fakes are
 * drawn from reserved namespaces no real value can occupy, so a second pass
 * recognises and keeps them. See docs/adr/0004-preserve-vs-redact.md.
 */
export const defaultPreserve: PreserveRule[] = [
  {
    id: "db-ids",
    keys: /(?:^|_)(?:id|uuid|guid)$/i,
    enabled: true,
  },
  {
    id: "timestamps",
    keys: /(?:^|_)(?:created|updated|deleted)_?(?:at|on)$|timestamp/i,
    match: TIMESTAMP,
    enabled: true,
  },
  {
    id: "fake-email",
    isFake: (text) => text.includes("@") && EXAMPLE_TLD.test(text),
    enabled: true,
  },
  {
    id: "fake-ip",
    isFake: (text) => TEST_NET.test(text),
    enabled: true,
  },
  {
    id: "fake-ipv6",
    isFake: (text) => DOC_IPV6.test(text),
    enabled: true,
  },
  {
    id: "fake-mac",
    isFake: (text) => FAKE_MAC.test(text),
    enabled: true,
  },
];
