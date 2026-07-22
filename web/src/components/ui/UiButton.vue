<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition',
      'disabled:cursor-not-allowed disabled:opacity-45',
      sizeClass,
      variantClass,
      block ? 'w-full' : '',
    ]"
  >
    <span
      v-if="loading"
      class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  block?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
})

const sizeClass = computed(() =>
  props.size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',
)
const variantClass = computed(
  () =>
    ({
      primary: 'bg-teal text-white hover:bg-teal-deep',
      secondary: 'bg-teal-soft text-teal-deep hover:bg-teal-mist',
      ghost: 'border border-slate-line bg-white text-navy hover:border-teal hover:text-teal',
      danger: 'bg-peach text-amber-deep hover:brightness-95',
    })[props.variant],
)
</script>
