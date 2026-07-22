<template>
  <button
    type="button"
    :title="value"
    class="mono inline-flex items-center gap-1.5 rounded-md bg-slate-panel px-2 py-1
           text-navy-soft transition hover:bg-teal-soft hover:text-teal-deep"
    @click="copy"
  >
    {{ shortHash(value) }}
    <span class="text-[0.65rem] font-sans font-semibold">{{ copied ? '✓' : '⧉' }}</span>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { shortHash } from '@/lib/format'

const props = defineProps<{ value: string }>()
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* presse-papiers indisponible : le title reste lisible */
  }
}
</script>
