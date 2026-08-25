import type {
  Detector,
  LeshyConfig,
  LocaleSetting,
  PreserveRule,
  SemanticConfig,
} from "./types.ts";
import { builtins } from "./detect/detectors/index.ts";
import { packs } from "./packs/index.ts";
import { defaultPreserve } from "./preserve.ts";
import { DEFAULT_MODEL } from "./detect/semantic/models.ts";
import { generators } from "./generate/generators.ts";

/** Fixed default so behaviour is reproducible out of the box (adr/0002). */
export const DEFAULT_SALT = "leshy-v1";

/** Recall/precision dial validated in the spike (adr/0001). */
export const DEFAULT_THRESHOLD = 0.35;

export const defineConfig = (config: LeshyConfig): LeshyConfig => config;

export interface ResolvedConfig {
  /** Ids of the country packs whose detectors are in `detectors`. */
  countries: string[];
  detectors: Detector[];
  preserve: PreserveRule[];
  salt: string;
  locale: LocaleSetting;
  semantic: SemanticConfig;
  /** Values the user chose to leave verbatim, whatever detected them. */
  keep: string[];
}

/** The fakes a rule written in the UI can pick from: every built-in generator. */
export type FakeType = keyof typeof generators;

export const fakeTypes = Object.keys(generators) as FakeType[];

/**
 * A detector written in the settings dialog. Regexes travel as source text
 * (no flags: `pattern` runs global, `keys` case-insensitive) and become a
 * structural or key detector in resolveConfig. At least one of the two is set.
 */
export interface CustomRule {
  id: string;
  label: string;
  pattern?: string;
  keys?: string;
  type: FakeType;
  enabled: boolean;
}

/** A preserve rule written in the settings dialog; same shape as PreserveRule. */
export interface KeepRule {
  id: string;
  label: string;
  keys?: string;
  match?: string;
  enabled: boolean;
}

const toDetector = (r: CustomRule): Detector => {
  const base = {
    id: r.id,
    label: r.label,
    type: r.type,
    enabled: r.enabled,
    generate: generators[r.type],
    ...(r.keys ? { keys: new RegExp(r.keys, "i") } : {}),
  };
  return r.pattern
    ? { ...base, kind: "structural", match: new RegExp(r.pattern, "g") }
    : { ...base, kind: "key", keys: new RegExp(r.keys ?? "(?!)", "i") };
};

const toPreserve = (r: KeepRule): PreserveRule => ({
  id: r.id,
  enabled: r.enabled,
  ...(r.keys ? { keys: new RegExp(r.keys, "i") } : {}),
  ...(r.match ? { match: new RegExp(r.match) } : {}),
});

/**
 * Serialisable adjustments a UI applies over the code-defined config. Only
 * data crosses the worker boundary, so nothing here can carry a function.
 */
export interface ConfigOverrides {
  /** Detector ids toggled, applied over `LeshyConfig.disable`/`enable`. */
  disable?: string[];
  enable?: string[];
  /** Country pack ids selected (adr/0008). */
  countries?: string[];
  locale?: LocaleSetting;
  salt?: string;
  semanticEnabled?: boolean;
  /** Exact values to leave verbatim: a click on a mark says "not this one". */
  keep?: string[];
  /** Rules written in the UI, appended after the code-defined ones. */
  rules?: CustomRule[];
  keepRules?: KeepRule[];
}

// A toggle in the UI is the later decision, so it wins over the config's lists.
const applyOverrides = (config: LeshyConfig, o: ConfigOverrides): LeshyConfig => ({
  ...config,
  disable: [
    ...(config.disable ?? []).filter((id) => !o.enable?.includes(id)),
    ...(o.disable ?? []),
  ],
  enable: [...(config.enable ?? []).filter((id) => !o.disable?.includes(id)), ...(o.enable ?? [])],
  countries: o.countries ?? config.countries,
  locale: o.locale ?? config.locale,
  salt: o.salt ?? config.salt,
  semantic: {
    ...config.semantic,
    ...(o.semanticEnabled === undefined ? {} : { enabled: o.semanticEnabled }),
  },
});

export const resolveConfig = (
  base: LeshyConfig = {},
  overrides?: ConfigOverrides,
): ResolvedConfig => {
  const config = overrides ? applyOverrides(base, overrides) : base;
  const disabled = new Set(config.disable ?? []);
  const enabled = new Set(config.enable ?? []);
  const wanted = config.countries;
  const selected = wanted === undefined ? packs : packs.filter((p) => wanted.includes(p.id));
  // Packs first: their national-id checksums are the most specific rules in the
  // list, and declaration order breaks equal-tier ties (adr/0004).
  const all = [
    ...selected.flatMap((p) => p.detectors),
    ...builtins,
    ...(config.detectors ?? []),
    ...(overrides?.rules ?? []).map(toDetector),
  ];
  const detectors = all.map((d) => {
    if (disabled.has(d.id)) return { ...d, enabled: false };
    if (enabled.has(d.id)) return { ...d, enabled: true };
    return d;
  });
  return {
    countries: selected.map((p) => p.id),
    detectors,
    preserve: [
      ...defaultPreserve,
      ...selected.flatMap((p) => p.preserve ?? []),
      ...(config.preserve ?? []),
      ...(overrides?.keepRules ?? []).map(toPreserve),
    ],
    salt: config.salt ?? DEFAULT_SALT,
    locale: config.locale ?? "auto",
    keep: overrides?.keep ?? [],
    semantic: {
      model: DEFAULT_MODEL,
      threshold: DEFAULT_THRESHOLD,
      enabled: true,
      ...config.semantic,
    },
  };
};
