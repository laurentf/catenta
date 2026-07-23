<template>
  <div>
    <div
      role="tablist"
      class="flex flex-wrap gap-1 overflow-x-auto border-b border-slate-line"
    >
      <button
        v-for="tb in tabs"
        :key="tb.key"
        type="button"
        role="tab"
        :aria-selected="tb.key === modelValue"
        :disabled="tb.locked"
        :title="tb.locked ? tb.hint : undefined"
        :class="[
          'relative flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition',
          '-mb-px border-b-2',
          tb.locked
            ? 'cursor-not-allowed border-transparent text-slate-muted/70'
            : tb.key === modelValue
              ? 'border-teal text-teal-deep'
              : 'border-transparent text-navy-soft hover:text-teal',
        ]"
        @click="select(tb)"
      >
        {{ tb.label }}
        <span v-if="tb.locked" aria-hidden="true" class="text-[0.85em]">🔒</span>
      </button>
    </div>
    <div class="pt-6">
      <slot :active="modelValue" />
    </div>
  </div>
</template>

<script setup lang="ts">
export interface TabDef {
  key: string
  label: string
  locked?: boolean
  hint?: string
}

defineProps<{ modelValue: string; tabs: TabDef[] }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

function select(tb: TabDef) {
  if (!tb.locked) emit('update:modelValue', tb.key)
}
</script>
