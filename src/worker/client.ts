import type { ScrubResult } from "../core/types.ts";
import type { ScrubOverrides, WorkerRequest, WorkerResponse, WorkerStage } from "./protocol.ts";

export interface ScrubOutcome extends ScrubResult {
  /** Set when detection ran without the model. */
  warning?: string;
}

/** Typed RPC over postMessage — the platform needs no library for this. */
export class ScrubWorker {
  private readonly worker: Worker;
  private nextId = 1;
  private lastScrubId: number | undefined;
  private readonly pending = new Map<
    number,
    { resolve: (outcome: ScrubOutcome) => void; reject: (error: Error) => void }
  >();

  onStage: ((stage: WorkerStage) => void) | undefined;

  constructor() {
    this.worker = new Worker(new URL("./detect.worker.ts", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.kind === "progress") {
        this.onStage?.(response.stage);
        return;
      }
      const pendingRequest = this.pending.get(response.id);
      if (!pendingRequest) return;

      if (response.kind === "result") {
        this.pending.delete(response.id);
        const outcome: ScrubOutcome = { ...response.result };
        if (response.warning !== undefined) outcome.warning = response.warning;
        pendingRequest.resolve(outcome);
      } else if (response.kind === "error") {
        this.pending.delete(response.id);
        pendingRequest.reject(new Error(response.message));
      }
    });
  }

  /** Starts model download/initialisation without blocking first paint. */
  warmup(): void {
    this.post({ id: this.nextId++, kind: "warmup" });
  }

  /**
   * Settle the outstanding scrub promise. The worker coalesces to the latest
   * request and never replies to a dropped one, so an unsettled promise would
   * hold its caller's continuation for the lifetime of the page.
   */
  cancel(): void {
    if (this.lastScrubId === undefined) return;
    const previousRequest = this.pending.get(this.lastScrubId);
    this.pending.delete(this.lastScrubId);
    this.lastScrubId = undefined;
    previousRequest?.reject(new Error("superseded"));
  }

  scrub(input: string, overrides?: ScrubOverrides): Promise<ScrubOutcome> {
    this.cancel();
    const id = this.nextId++;
    this.lastScrubId = id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ id, kind: "scrub", input, overrides });
    });
  }

  terminate(): void {
    this.worker.terminate();
  }

  private post(request: WorkerRequest): void {
    this.worker.postMessage(request);
  }
}
