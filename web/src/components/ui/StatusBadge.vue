<template>
  <span :class="['inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', cls]">
    <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {{ t(`status.${key}`) }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Status } from '@/lib/contracts'

const props = defineProps<{ status: Status }>()
const { t } = useI18n()

const key = computed(
  () => (['manufactured', 'certified', 'placed'] as const)[props.status] ?? 'unknown',
)
const cls = computed(
  () =>
    ({
      [Status.Manufactured]: 'bg-slate-panel text-navy-soft',
      [Status.Certified]: 'bg-teal-soft text-teal-deep',
      [Status.Placed]: 'bg-lime text-amber-deep',
    })[props.status] ?? 'bg-slate-panel text-navy-soft',
)
</script>
