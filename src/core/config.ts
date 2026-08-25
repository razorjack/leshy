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
  const all = [...selected.flatMap((p) => p.detectors), ...builtins, ...(config.detectors ?? [])];
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
