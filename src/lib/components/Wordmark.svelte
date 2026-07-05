<script lang="ts">
  // The watcher mark + display wordmark (docs/adr/0005). The eye blinks slowly
  // while the worker is scanning; static under prefers-reduced-motion.
  let { scanning = false }: { scanning?: boolean } = $props()
</script>

<div class="flex items-center gap-2.5">
  <svg viewBox="0 0 64 64" class="size-6 text-primary" aria-hidden="true">
    <path
      d="M8 32 C20 14, 44 14, 56 32 C44 50, 20 50, 8 32 Z"
      fill="none"
      stroke="currentColor"
      stroke-width="4.5"
      stroke-linejoin="round"
    />
    <circle cx="32" cy="32" r="7.5" fill="currentColor" class:blink={scanning} />
  </svg>
  <span class="font-display text-xl font-semibold tracking-tight">Leshy</span>
</div>

<style>
  @keyframes leshy-blink {
    0%,
    88%,
    100% {
      transform: scaleY(1);
    }
    94% {
      transform: scaleY(0.08);
    }
  }
  .blink {
    transform-box: fill-box;
    transform-origin: center;
    animation: leshy-blink 2.6s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .blink {
      animation: none;
    }
  }
</style>
