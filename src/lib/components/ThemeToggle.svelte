<script lang="ts">
  import { Monitor, Moon, Sun } from '@lucide/svelte'
  import { cycleTheme, themeSetting, type ThemeSetting } from '../theme.ts'

  // initTheme() (main.ts) ran before mount, so this reads the setting back.
  // With three settings the icon shows the current one, not the next one.
  let setting = $state<ThemeSetting>(themeSetting())
  const label = $derived(
    setting === 'system' ? 'Theme: follows the system' : `Theme: always ${setting}`,
  )
</script>

<button
  type="button"
  class="rounded-md border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground"
  aria-label={label}
  title={label}
  onclick={() => (setting = cycleTheme())}
>
  {#if setting === 'system'}
    <Monitor class="size-3.5" />
  {:else if setting === 'dark'}
    <Moon class="size-3.5" />
  {:else}
    <Sun class="size-3.5" />
  {/if}
</button>
