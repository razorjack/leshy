import type { LocaleSetting, ScrubResult } from "../core/types.ts";

/**
 * Worker boundary. Detection (model included) runs in the Web Worker; the UI
 * thread only ever sends raw text and receives results. Custom detectors from
 * leshy.config.ts contain functions, so the config is statically imported BY
 * the worker bundle — only serialisable overrides cross this boundary.
 */

export interface ScrubOverrides {
  /** Detector ids toggled from the UI, applied over leshy.config.ts. */
  disable?: string[];
  enable?: string[];
  /** Country pack ids selected in the UI (adr/0008). */
  countries?: string[];
  locale?: LocaleSetting;
  salt?: string;
  semanticEnabled?: boolean;
}

export type WorkerRequest =
  | { id: number; kind: "warmup" }
  | { id: number; kind: "scrub"; input: string; overrides?: ScrubOverrides };

export type WorkerStage = "loading-model" | "detecting" | "generating";

export type WorkerResponse =
  | { id: number; kind: "ready" }
  | { id: number; kind: "progress"; stage: WorkerStage }
  | { id: number; kind: "result"; result: ScrubResult }
  | { id: number; kind: "error"; message: string };
