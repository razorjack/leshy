import type { Replacement } from "../core/types.ts";
import { ScrubWorker } from "../worker/client.ts";
import type { ScrubOverrides } from "../worker/protocol.ts";

export type SessionStage = "idle" | "loading-model" | "working" | "done" | "error";

const DEBOUNCE_MS = 150;

/**
 * Owns the ScrubWorker lifecycle. The worker (and its ~180 MB model) is created
 * lazily on the first real input and warmed up immediately. Typing is debounced;
 * a paste scrubs immediately. Every scrub supersedes the previous one (the
 * client cancels it and the worker coalesces to the latest), so a burst of input
 * yields exactly one final result and never overlaps inference.
 */
class Session {
  input = $state("");
  output = $state("");
  replacements = $state<Replacement[]>([]);
  stage = $state<SessionStage>("idle");
  error = $state<string | undefined>(undefined);

  private overrides: ScrubOverrides = {};
  private worker: ScrubWorker | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private token = 0;
  private running = false;

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

  /** Called from the input surface. Typing debounces; a paste runs immediately. */
  setInput(value: string, immediate = false): void {
    this.input = value;
    if (this.timer) clearTimeout(this.timer);
    if (value.trim() === "") {
      this.token++; // cancel any in-flight response
      this.worker?.cancel(); // …and settle its promise
      this.running = false;
      this.output = "";
      this.replacements = [];
      this.stage = "idle";
      this.error = undefined;
      return;
    }
    this.ensureWorker();
    if (immediate) {
      void this.run(value);
    } else {
      this.timer = setTimeout(() => void this.run(value), DEBOUNCE_MS);
    }
  }

  /** Settings changes: re-scrub the current input immediately with new overrides. */
  setOverrides(overrides: ScrubOverrides): void {
    // Snapshot first: the settings dialog holds its lists in $state, and a
    // proxy fails structured cloning the moment postMessage tries to send it.
    this.overrides = $state.snapshot(overrides);
    if (this.input.trim() !== "") void this.run(this.input);
  }

  private async run(value: string): Promise<void> {
    const worker = this.ensureWorker();
    const token = ++this.token;
    this.running = true;
    this.error = undefined;
    this.stage = "working";
    try {
      const result = await worker.scrub(value, this.overrides);
      if (token !== this.token) return; // superseded by a newer request
      this.output = result.output;
      this.replacements = result.replacements;
      this.stage = "done";
    } catch (e) {
      if (token !== this.token) return; // superseded — its rejection is expected
      this.error = e instanceof Error ? e.message : String(e);
      this.stage = "error";
    } finally {
      if (token === this.token) this.running = false;
    }
  }
}

export const session = new Session();
