<script lang="ts">
  import Wordmark from '$lib/components/Wordmark.svelte'
  import InputPane from '$lib/components/InputPane.svelte'
  import OutputPane from '$lib/components/OutputPane.svelte'
  import ThemeToggle from '$lib/components/ThemeToggle.svelte'
  import SettingsDialog from '$lib/components/SettingsDialog.svelte'
  import { session } from './state/session.svelte.ts'
  import { onShortcut } from '$lib/shortcuts.ts'
</script>

<svelte:window onkeydown={onShortcut} />

<div class="flex min-h-svh flex-col">
  <header class="flex items-center justify-between border-b border-border px-6 py-3">
    <Wordmark scanning={session.stage === 'working' || session.stage === 'loading-model'} />
    <div class="flex items-center gap-2">
      <SettingsDialog />
      <ThemeToggle />
    </div>
  </header>

  <main class="grid flex-1 gap-px bg-border md:grid-cols-2">
    <InputPane />
    <OutputPane />
  </main>

  <footer
    class="flex items-center justify-between border-t border-border px-6 py-2 text-xs text-muted-foreground"
  >
    <p>Runs entirely in this tab — nothing leaves the woods.</p>
    {#if session.stage === 'loading-model'}
      <span>Loading model…</span>
    {:else if session.stage === 'working'}
      <span>Scanning…</span>
    {:else if session.stage === 'error'}
      <span class="text-destructive">{session.error}</span>
    {:else if session.warning}
      <span class="text-destructive">{session.warning}</span>
    {/if}
  </footer>
</div>
