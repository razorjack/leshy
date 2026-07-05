import type { Replacement } from "../core/types.ts";
import { ScrubWorker } from "../worker/client.ts";
import type { ScrubOverrides } from "../worker/protocol.ts";

export type SessionStage = "idle" | "loading-model" | "working" | "done" | "error";

const DEBOUNCE_MS = 150;

/**
 * Owns the ScrubWorker lifecycle. The worker (and its ~180 MB model) is created
 * lazily on first interaction and warmed up immediately; input changes are
 * debounced, and stale responses are dropped by comparing a monotonic token so
 * fast typing yields exactly one final result.
 */
class Session {
  input = $state("");
  output = $state("");
  replacements = $state<Replacement[]>([]);
  stage = $state<SessionStage>("idle");
  error = $state<string | undefined>(undefined);
  /** Reassign (not mutate) to re-scrub the current input, e.g. from settings. */
  overrides = $state<ScrubOverrides>({});

  private worker: ScrubWorker | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private token = 0;
  private running = false;

  constructor() {
    $effect.root(() => {
      $effect(() => {
        const value = this.input;
        void this.overrides; // track: settings changes re-scrub
        this.schedule(value);
      });
    });
  }

  private ensureWorker(): ScrubWorker {
    if (!this.worker) {
      this.worker = new ScrubWorker();
      this.worker.onStage = (stage) => {
        if (this.running) this.stage = stage === "loading-model" ? "loading-model" : "working";
      };
      this.worker.warmup();
    }
    return this.worker;
  }

  private schedule(value: string): void {
    if (this.timer) clearTimeout(this.timer);
    if (value.trim() === "") {
      this.token++; // cancel any in-flight response
      this.output = "";
      this.replacements = [];
      this.stage = "idle";
      this.error = undefined;
      return;
    }
    this.ensureWorker(); // lazy: created + warmed on the first real input
    this.timer = setTimeout(() => void this.run(value), DEBOUNCE_MS);
  }

  private async run(value: string): Promise<void> {
    const worker = this.ensureWorker();
    const token = ++this.token;
    this.running = true;
    this.error = undefined;
    this.stage = "working";
    try {
      // $state proxies aren't structured-cloneable; snapshot to a plain object
      // before it crosses the worker boundary (postMessage).
      const result = await worker.scrub(value, $state.snapshot(this.overrides));
      if (token !== this.token) return; // superseded by a newer request
      this.output = result.output;
      this.replacements = result.replacements;
      this.stage = "done";
    } catch (e) {
      if (token !== this.token) return;
      this.error = e instanceof Error ? e.message : String(e);
      this.stage = "error";
    } finally {
      if (token === this.token) this.running = false;
    }
  }
}

export const session = new Session();
