<script lang="ts">
  import { onMount } from 'svelte'
  import { SlidersHorizontal } from '@lucide/svelte'
  import { session } from '../../state/session.svelte.ts'
  import { resolveConfig } from '../../core/config.ts'
  import * as Dialog from './ui/dialog/index.ts'
  import { Switch } from './ui/switch/index.ts'

  const SALT_KEY = 'leshy-salt'
  const OVERRIDES_KEY = 'leshy-overrides'

  const detectors = resolveConfig().detectors
  const defaults: Record<string, boolean> = Object.fromEntries(
    detectors.map((d) => [d.id, d.enabled]),
  )

  let enabled = $state<Record<string, boolean>>({ ...defaults })
  let semantic = $state(true)
  let salt = $state('')

  // Derive the serialisable overrides from the toggle state relative to the
  // built-in defaults, push them to the session (re-scrubs) and persist them.
  const apply = (): void => {
    const disable = detectors.filter((d) => defaults[d.id] && !enabled[d.id]).map((d) => d.id)
    const enable = detectors.filter((d) => !defaults[d.id] && enabled[d.id]).map((d) => d.id)
    session.overrides = { disable, enable, semanticEnabled: semantic, ...(salt ? { salt } : {}) }
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ disable, enable, semanticEnabled: semantic }))
    if (salt) localStorage.setItem(SALT_KEY, salt)
    else localStorage.removeItem(SALT_KEY)
  }

  onMount(() => {
    salt = localStorage.getItem(SALT_KEY) ?? ''
    try {
      const saved = JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '{}') as {
        disable?: string[]
        enable?: string[]
        semanticEnabled?: boolean
      }
      if (saved.semanticEnabled === false) semantic = false
      for (const id of saved.disable ?? []) enabled[id] = false
      for (const id of saved.enable ?? []) enabled[id] = true
    } catch {
      // ignore malformed storage
    }
    apply()
  })

  const setDetector = (id: string, value: boolean): void => {
    enabled[id] = value
    apply()
  }
</script>

<Dialog.Root>
  <Dialog.Trigger
    class="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
    aria-label="Settings"
  >
    <SlidersHorizontal class="size-3.5" />
  </Dialog.Trigger>
  <Dialog.Content class="max-h-[85svh] overflow-auto sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Settings</Dialog.Title>
      <Dialog.Description>
        Everything runs locally. Toggles and salt are stored only in this browser.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Salt</span>
        <input
          type="text"
          value={salt}
          placeholder="leshy-v1 (default)"
          class="rounded-md border border-input bg-transparent px-3 py-1.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          oninput={(e) => {
            salt = e.currentTarget.value
            apply()
          }}
        />
        <span class="text-xs text-muted-foreground">Changes every fake deterministically.</span>
      </label>

      <div class="flex items-center justify-between gap-4">
        <span class="text-sm font-medium">Semantic model (names, addresses, orgs)</span>
        <Switch checked={semantic} onCheckedChange={(v) => { semantic = v; apply() }} />
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Detectors</span>
        <ul class="divide-y divide-border rounded-md border border-border">
          {#each detectors as d (d.id)}
            <li class="flex items-center justify-between gap-4 px-3 py-2">
              <span class="flex flex-col">
                <span class="text-sm">{d.label}</span>
                <span class="font-mono text-xs text-muted-foreground">{d.id}</span>
              </span>
              <Switch
                checked={enabled[d.id]}
                onCheckedChange={(v) => setDetector(d.id, v)}
                aria-label={d.label}
              />
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
