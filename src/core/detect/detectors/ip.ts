import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

export const ipv4: StructuralDetector = {
  id: "ipv4",
  label: "IPv4 address",
  type: "ip",
  kind: "structural",
  enabled: true,
  match:
    /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d.])/g,
  keys: /^ip$|ip_?addr/i,
  generate: generators.ipv4,
};

// Broad candidate, strict validator — compressed forms (::) make a precise
// regex unreadable, and the validator is the source of truth anyway.
export const ipv6: StructuralDetector = {
  id: "ipv6",
  label: "IPv6 address",
  type: "ip",
  kind: "structural",
  enabled: true,
  match: /(?<![:.\w])[0-9A-Fa-f:]{2,45}(?![:.\w])/g,
  validate: (text) => {
    if (!text.includes(":")) return false;
    const parts = text.split("::");
    if (parts.length > 2) return false;
    const groups = (side: string): string[] => (side === "" ? [] : side.split(":"));
    const all = [...groups(parts[0] ?? ""), ...groups(parts[1] ?? "")];
    if (all.length === 0 || !all.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
    return parts.length === 2 ? all.length <= 7 : all.length === 8;
  },
  generate: generators.ipv6,
};
