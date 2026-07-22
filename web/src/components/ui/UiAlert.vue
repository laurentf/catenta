<template>
  <div :class="['rounded-card px-4 py-3 text-sm leading-relaxed', cls]">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ tone?: 'info' | 'warn' | 'ok' }>(), { tone: 'info' })
const cls = computed(
  () =>
    ({
      info: 'bg-slate-panel text-navy-soft',
      warn: 'bg-peach text-amber-deep',
      ok: 'bg-teal-mist text-teal-deep',
    })[props.tone],
)
</script>
