<script lang="ts">
  // The watcher mark blinks slowly while the worker is scanning; static under
  // prefers-reduced-motion.
  let { scanning = false }: { scanning?: boolean } = $props()
</script>

<div class="flex items-center gap-2.5">
  <span class="block size-8 shrink-0" class:blink={scanning} aria-hidden="true">
    <img src="/icons/mark-light-128.png" alt="" class="size-full object-contain dark:hidden" />
    <img src="/icons/mark-dark-128.png" alt="" class="hidden size-full object-contain dark:block" />
  </span>
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
