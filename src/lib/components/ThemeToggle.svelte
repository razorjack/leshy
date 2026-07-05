<script lang="ts">
  // TODO(opus): implementation-plan.md step 14 — respect prefers-color-scheme
  // on first load, persist the override in localStorage('leshy-theme').
  const toggle = () => {
    document.documentElement.classList.toggle('dark')
  }
</script>

<button
  type="button"
  class="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
  onclick={toggle}
>
  theme
</button>
