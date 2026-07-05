<script lang="ts">
  import Wordmark from '$lib/components/Wordmark.svelte'
  import InputPane from '$lib/components/InputPane.svelte'
  import OutputPane from '$lib/components/OutputPane.svelte'
  import ThemeToggle from '$lib/components/ThemeToggle.svelte'
  import { session } from './state/session.svelte.ts'
</script>

<!-- TODO(opus): docs/implementation-plan.md steps 12–15 — wire panes to the
     scrub worker via session, add the settings dialog and the copy flow. -->
<div class="flex min-h-svh flex-col">
  <header class="flex items-center justify-between border-b border-border px-6 py-3">
    <Wordmark />
    <ThemeToggle />
  </header>

  <main class="grid flex-1 gap-px bg-border md:grid-cols-2">
    <InputPane />
    <OutputPane />
  </main>

  <footer class="border-t border-border px-6 py-2 text-xs text-muted-foreground">
    <p>Runs entirely in this tab — nothing leaves the woods. {session.stage}</p>
  </footer>
</div>
