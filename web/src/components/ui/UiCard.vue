<template>
  <section :class="toneClass">
    <header v-if="title || $slots.header" class="mb-4 flex items-start gap-3">
      <span v-if="badge" :class="['ui-badge-circle', badgeClass]">{{ badge }}</span>
      <div class="min-w-0 flex-1">
        <h2 v-if="title" class="text-base font-extrabold uppercase tracking-wider text-navy">
          {{ title }}
        </h2>
        <p v-if="subtitle" class="mt-1 text-sm text-slate-label">{{ subtitle }}</p>
        <slot name="header" />
      </div>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  title?: string
  subtitle?: string
  /** Une ou deux lettres / un pictogramme dans la pastille ronde. */
  badge?: string
  tone?: 'plain' | 'mint' | 'panel' | 'peach'
  badgeTone?: 'navy' | 'teal'
}
const props = withDefaults(defineProps<Props>(), { tone: 'plain', badgeTone: 'teal' })

const toneClass = computed(
  () =>
    ({
      plain: 'card',
      mint: 'card-mint',
      panel: 'card-panel',
      peach: 'card-peach',
    })[props.tone],
)
const badgeClass = computed(() =>
  props.badgeTone === 'navy' ? 'bg-navy text-white' : 'bg-teal-accent text-white',
)
</script>

<style scoped>
.ui-badge-circle {
  @apply flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-bold;
}
</style>
