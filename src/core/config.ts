import type { Detector, LeshyConfig, PreserveRule, SemanticConfig } from "./types.ts";
import { builtins } from "./detect/detectors/index.ts";
import { defaultPreserve } from "./preserve.ts";
import { DEFAULT_MODEL } from "./detect/semantic/models.ts";

/** Fixed default so behaviour is reproducible out of the box (adr/0002). */
export const DEFAULT_SALT = "leshy-v1";

/** Recall/precision dial validated in the spike (adr/0001). */
export const DEFAULT_THRESHOLD = 0.35;

export const defineConfig = (config: LeshyConfig): LeshyConfig => config;

export interface ResolvedConfig {
  detectors: Detector[];
  preserve: PreserveRule[];
  salt: string;
  semantic: SemanticConfig;
}

export const resolveConfig = (config: LeshyConfig = {}): ResolvedConfig => {
  const disabled = new Set(config.disable ?? []);
  const enabled = new Set(config.enable ?? []);
  const detectors = [...builtins, ...(config.detectors ?? [])].map((d) => {
    if (disabled.has(d.id)) return { ...d, enabled: false };
    if (enabled.has(d.id)) return { ...d, enabled: true };
    return d;
  });
  return {
    detectors,
    preserve: [...defaultPreserve, ...(config.preserve ?? [])],
    salt: config.salt ?? DEFAULT_SALT,
    semantic: {
      model: DEFAULT_MODEL,
      threshold: DEFAULT_THRESHOLD,
      enabled: true,
      ...config.semantic,
    },
  };
};
