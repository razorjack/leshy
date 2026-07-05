<script lang="ts">
  import Wordmark from '$lib/components/Wordmark.svelte'
  import InputPane from '$lib/components/InputPane.svelte'
  import OutputPane from '$lib/components/OutputPane.svelte'
  import ThemeToggle from '$lib/components/ThemeToggle.svelte'
  import SettingsDialog from '$lib/components/SettingsDialog.svelte'
  import { session } from './state/session.svelte.ts'
</script>

<div class="flex min-h-svh flex-col">
  <header class="flex items-center justify-between border-b border-border px-6 py-3">
    <Wordmark />
    <div class="flex items-center gap-2">
      <SettingsDialog />
      <ThemeToggle />
    </div>
  </header>

  <main class="grid flex-1 gap-px bg-border md:grid-cols-2">
    <InputPane />
    <OutputPane />
  </main>

  <footer class="border-t border-border px-6 py-2 text-xs text-muted-foreground">
    <p>Runs entirely in this tab — nothing leaves the woods. {session.stage}</p>
  </footer>
</div>
