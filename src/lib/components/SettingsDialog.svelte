<script lang="ts">
  import { onMount } from 'svelte'
  import { SlidersHorizontal } from '@lucide/svelte'
  import userConfig from '../../../leshy.config.ts'
  import { session } from '../../state/session.svelte.ts'
  import { resolveConfig, fakeTypes } from '../../core/config.ts'
  import type { ConfigOverrides, CustomRule, FakeType, KeepRule } from '../../core/config.ts'
  import { packs } from '../../core/packs/index.ts'
  import { LOCALES, locales } from '../../core/generate/locales.ts'
  import type { LocaleSetting } from '../../core/types.ts'
  import * as Dialog from './ui/dialog/index.ts'
  import { Switch } from './ui/switch/index.ts'

  const SETTINGS_KEY = 'leshy-settings'
  // Pre-v1 storage: overrides and salt under two keys. Read once, then dropped.
  const LEGACY_KEYS = { overrides: 'leshy-overrides', salt: 'leshy-salt' }

  type StoredSettings = {
    v: 1
    disable?: string[]
    enable?: string[]
    countries?: string[]
    locale?: LocaleSetting
    semanticEnabled?: boolean
    salt?: string
    rules?: CustomRule[]
    keepRules?: KeepRule[]
  }

  const loadSettings = (): Partial<StoredSettings> => {
    try {
      const storedSettings = localStorage.getItem(SETTINGS_KEY)
      if (storedSettings) return JSON.parse(storedSettings) as StoredSettings

      const legacyOverrides = JSON.parse(
        localStorage.getItem(LEGACY_KEYS.overrides) ?? '{}',
      ) as Partial<StoredSettings>
      const legacySalt = localStorage.getItem(LEGACY_KEYS.salt)
      if (legacySalt) legacyOverrides.salt = legacySalt
      return legacyOverrides
    } catch {
      return {} // malformed storage reads as no settings
    }
  }

  // The worker resolves the same file; the UI must diff its toggles against
  // that baseline, or a detector enabled in the config shows as off here.
  const baseConfig = resolveConfig(userConfig)
  const detectorDefaults: Record<string, boolean> = Object.fromEntries(
    baseConfig.detectors.map((detector) => [detector.id, detector.enabled]),
  )

  let enabled = $state<Record<string, boolean>>({ ...detectorDefaults })
  let countries = $state<string[]>([...baseConfig.countries])
  let locale = $state<LocaleSetting>(baseConfig.locale)
  let semantic = $state(baseConfig.semantic.enabled)
  let salt = $state('')
  let rules = $state<CustomRule[]>([])
  let keepRules = $state<KeepRule[]>([])

  // Deselecting a country takes its detectors out of the config, so the list
  // below shows exactly what is running rather than every rule Leshy ships.
  const detectors = $derived(resolveConfig(userConfig, { countries }).detectors)

  // Derive the serialisable overrides from the toggle state relative to the
  // built-in defaults, push them to the session (re-scrubs) and persist them.
  const currentOverrides = (): ConfigOverrides => {
    const disable = baseConfig.detectors
      .filter((detector) => detectorDefaults[detector.id] && !enabled[detector.id])
      .map((detector) => detector.id)
    const enable = baseConfig.detectors
      .filter((detector) => !detectorDefaults[detector.id] && enabled[detector.id])
      .map((detector) => detector.id)
    const overrides: ConfigOverrides = {
      disable,
      enable,
      countries,
      locale,
      semanticEnabled: semantic,
      rules,
      keepRules,
    }
    if (salt) overrides.salt = salt
    return overrides
  }

  const apply = (): void => {
    const overrides = currentOverrides()
    session.setOverrides(overrides)

    const stored: StoredSettings = { v: 1, ...overrides }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored))
    localStorage.removeItem(LEGACY_KEYS.overrides)
    localStorage.removeItem(LEGACY_KEYS.salt)
  }

  onMount(() => {
    const saved = loadSettings()
    salt = saved.salt ?? ''
    if (saved.semanticEnabled === false) semantic = false
    if (saved.countries) {
      countries = saved.countries.filter((id) => packs.some((pack) => pack.id === id))
    }
    if (saved.locale && (saved.locale === 'auto' || locales.includes(saved.locale))) {
      locale = saved.locale
    }
    rules = (saved.rules ?? []).filter(
      (rule) => validPattern(rule.pattern) && validPattern(rule.keys),
    )
    keepRules = (saved.keepRules ?? []).filter(
      (rule) => validPattern(rule.keys) && validPattern(rule.match),
    )
    for (const id of saved.disable ?? []) enabled[id] = false
    for (const id of saved.enable ?? []) enabled[id] = true
    apply()
  })

  // Typing a salt would otherwise re-scrub (model pass included) per keystroke.
  let saltTimer: ReturnType<typeof setTimeout> | undefined
  const setSalt = (newSalt: string): void => {
    salt = newSalt
    clearTimeout(saltTimer)
    saltTimer = setTimeout(apply, 300)
  }

  // A regex the worker cannot compile would fail every scrub, so it never
  // leaves the form. Ids are unique per browser; nothing else keys on them.
  const validPattern = (pattern: string | undefined): boolean => {
    if (!pattern) return true
    try {
      new RegExp(pattern)
      return true
    } catch {
      return false
    }
  }
  const nextId = (prefix: string): string => {
    let highestId = 0
    for (const rule of [...rules, ...keepRules]) {
      const numericId = Number(rule.id.split('-')[1]) || 0
      highestId = Math.max(highestId, numericId)
    }
    return `${prefix}-${highestId + 1}`
  }

  let draft = $state({ label: '', pattern: '', keys: '', type: 'secret' as FakeType })
  const draftError = $derived.by(() => {
    if (!validPattern(draft.pattern) || !validPattern(draft.keys)) {
      return 'Not a valid regular expression'
    }
    if (draft.pattern === '' && draft.keys === '') {
      return 'A text pattern or a key pattern is needed'
    }
    return ''
  })
  const addRule = (): void => {
    if (draftError) return
    const rule: CustomRule = {
      id: nextId('rule'),
      label: draft.label.trim() || draft.pattern || draft.keys,
      type: draft.type,
      enabled: true,
    }
    if (draft.pattern) rule.pattern = draft.pattern
    if (draft.keys) rule.keys = draft.keys
    rules = [...rules, rule]
    draft = { label: '', pattern: '', keys: '', type: draft.type }
    apply()
  }

  let keepDraft = $state({ label: '', keys: '', match: '' })
  const keepError = $derived.by(() => {
    if (!validPattern(keepDraft.keys) || !validPattern(keepDraft.match)) {
      return 'Not a valid regular expression'
    }
    if (keepDraft.keys === '' && keepDraft.match === '') {
      return 'A key pattern or a value pattern is needed'
    }
    return ''
  })
  const addKeep = (): void => {
    if (keepError) return
    const keepRule: KeepRule = {
      id: nextId('keep'),
      label: keepDraft.label.trim() || keepDraft.keys || keepDraft.match,
      enabled: true,
    }
    if (keepDraft.keys) keepRule.keys = keepDraft.keys
    if (keepDraft.match) keepRule.match = keepDraft.match
    keepRules = [...keepRules, keepRule]
    keepDraft = { label: '', keys: '', match: '' }
    apply()
  }

  const field =
    'min-w-0 rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const addButton =
    'rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50'

  const setDetector = (id: string, isEnabled: boolean): void => {
    enabled[id] = isEnabled
    apply()
  }

  const setCountry = (id: string, isSelected: boolean): void => {
    if (isSelected) countries = [...countries, id]
    else countries = countries.filter((country) => country !== id)
    apply()
  }

  const describeRule = (rule: CustomRule): string => {
    const descriptions: string[] = []
    if (rule.pattern) descriptions.push(`/${rule.pattern}/`)
    if (rule.keys) descriptions.push(`key /${rule.keys}/i`)
    return `${descriptions.join(' · ')} → ${rule.type}`
  }

  const describeKeepRule = (rule: KeepRule): string => {
    const descriptions: string[] = []
    if (rule.keys) descriptions.push(`key /${rule.keys}/i`)
    if (rule.match) descriptions.push(`value /${rule.match}/`)
    return descriptions.join(' · ')
  }

  const setRuleEnabled = (index: number, isEnabled: boolean): void => {
    rules[index]!.enabled = isEnabled
    apply()
  }

  const setKeepRuleEnabled = (index: number, isEnabled: boolean): void => {
    keepRules[index]!.enabled = isEnabled
    apply()
  }

  const removeRule = (id: string): void => {
    rules = rules.filter((rule) => rule.id !== id)
    apply()
  }

  const removeKeepRule = (id: string): void => {
    keepRules = keepRules.filter((rule) => rule.id !== id)
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
        Everything runs locally. Toggles, rules and salt are stored only in this browser.
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
          oninput={(event) => setSalt(event.currentTarget.value)}
        />
        <span class="text-xs text-muted-foreground">Changes every fake deterministically.</span>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Locale</span>
        <select
          value={locale}
          class="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onchange={(event) => {
            locale = event.currentTarget.value as LocaleSetting
            apply()
          }}
        >
          <option value="auto">Automatic (from the text)</option>
          {#each locales as localeId (localeId)}
            <option value={localeId}>{LOCALES[localeId].label}</option>
          {/each}
        </select>
        <span class="text-xs text-muted-foreground">Which language the fakes are written in.</span>
      </label>

      <div class="flex items-center justify-between gap-4">
        <span class="text-sm font-medium">Semantic model (names, addresses, orgs)</span>
        <Switch
          checked={semantic}
          onCheckedChange={(value) => {
            semantic = value
            apply()
          }}
        />
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Countries</span>
        <p class="text-xs text-muted-foreground">
          National ids and local address formats. Off means those rules do not run.
        </p>
        <ul class="divide-y divide-border rounded-md border border-border">
          {#each packs as pack (pack.id)}
            <li class="flex items-center justify-between gap-4 px-3 py-2">
              <span class="flex flex-col">
                <span class="text-sm">{pack.label}</span>
                <span class="font-mono text-xs text-muted-foreground">
                  {pack.detectors.map((detector) => detector.id).join(' · ')}
                </span>
              </span>
              <Switch
                checked={countries.includes(pack.id)}
                onCheckedChange={(value) => setCountry(pack.id, value)}
                aria-label={pack.label}
              />
            </li>
          {/each}
        </ul>
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Detectors</span>
        <ul class="divide-y divide-border rounded-md border border-border">
          {#each detectors as detector (detector.id)}
            <li class="flex items-center justify-between gap-4 px-3 py-2">
              <span class="flex flex-col">
                <span class="text-sm">{detector.label}</span>
                <span class="font-mono text-xs text-muted-foreground">{detector.id}</span>
              </span>
              <Switch
                checked={enabled[detector.id]}
                onCheckedChange={(value) => setDetector(detector.id, value)}
                aria-label={detector.label}
              />
            </li>
          {/each}
        </ul>
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Your rules</span>
        <p class="text-xs text-muted-foreground">
          A regular expression over the text, a pattern for field names, or both. Matches are
          replaced with a fake of the chosen kind.
        </p>
        {#if rules.length > 0}
          <ul class="divide-y divide-border rounded-md border border-border">
            {#each rules as rule, index (rule.id)}
              <li class="flex items-center justify-between gap-4 px-3 py-2">
                <span class="flex min-w-0 flex-col">
                  <span class="truncate text-sm">{rule.label}</span>
                  <span class="truncate font-mono text-xs text-muted-foreground">
                    {describeRule(rule)}
                  </span>
                </span>
                <span class="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(value) => setRuleEnabled(index, value)}
                    aria-label={rule.label}
                  />
                  <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-destructive"
                    aria-label="Remove {rule.label}"
                    onclick={() => removeRule(rule.id)}
                  >
                    ×
                  </button>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="grid grid-cols-2 gap-2 rounded-md border border-dashed border-border p-3">
          <input
            type="text"
            placeholder="Label"
            class={field}
            bind:value={draft.label}
          />
          <select class={field} bind:value={draft.type}>
            {#each fakeTypes as fakeType (fakeType)}
              <option value={fakeType}>fake as {fakeType}</option>
            {/each}
          </select>
          <input
            type="text"
            placeholder="Text pattern, e.g. \bTKT-\d{6}\b"
            class="{field} font-mono"
            spellcheck="false"
            bind:value={draft.pattern}
          />
          <input
            type="text"
            placeholder="Key pattern, e.g. ^badge_no$"
            class="{field} font-mono"
            spellcheck="false"
            bind:value={draft.keys}
          />
          <span class="col-span-2 flex items-center justify-between gap-2">
            <span class="text-xs text-destructive">{draftError}</span>
            <button type="button" class={addButton} disabled={draftError !== ''} onclick={addRule}>
              Add rule
            </button>
          </span>
        </div>
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Keep as is</span>
        <p class="text-xs text-muted-foreground">
          Values under these keys, or of this shape, are left alone unless a checksum proves
          they are an id.
        </p>
        {#if keepRules.length > 0}
          <ul class="divide-y divide-border rounded-md border border-border">
            {#each keepRules as keepRule, index (keepRule.id)}
              <li class="flex items-center justify-between gap-4 px-3 py-2">
                <span class="flex min-w-0 flex-col">
                  <span class="truncate text-sm">{keepRule.label}</span>
                  <span class="truncate font-mono text-xs text-muted-foreground">
                    {describeKeepRule(keepRule)}
                  </span>
                </span>
                <span class="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={keepRule.enabled}
                    onCheckedChange={(value) => setKeepRuleEnabled(index, value)}
                    aria-label={keepRule.label}
                  />
                  <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-destructive"
                    aria-label="Remove {keepRule.label}"
                    onclick={() => removeKeepRule(keepRule.id)}
                  >
                    ×
                  </button>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="grid grid-cols-2 gap-2 rounded-md border border-dashed border-border p-3">
          <input
            type="text"
            placeholder="Label"
            class="{field} col-span-2"
            bind:value={keepDraft.label}
          />
          <input
            type="text"
            placeholder="Key pattern, e.g. ^support$"
            class="{field} font-mono"
            spellcheck="false"
            bind:value={keepDraft.keys}
          />
          <input
            type="text"
            placeholder="Value pattern, e.g. ^v\d+\."
            class="{field} font-mono"
            spellcheck="false"
            bind:value={keepDraft.match}
          />
          <span class="col-span-2 flex items-center justify-between gap-2">
            <span class="text-xs text-destructive">{keepError}</span>
            <button type="button" class={addButton} disabled={keepError !== ''} onclick={addKeep}>
              Add rule
            </button>
          </span>
        </div>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
