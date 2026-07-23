<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
      <TransitionGroup name="toast">
        <div
          v-for="n in toasts.items"
          :key="n.id"
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border bg-white px-4 py-3 shadow-lift"
          :class="border(n.tone)"
          role="status"
        >
          <span :class="['mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold', badge(n.tone)]">
            <span v-if="n.tone === 'pending'" class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span v-else-if="n.tone === 'success'">✓</span>
            <span v-else>✕</span>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-navy">{{ n.message }}</p>
            <a
              v-if="n.txHash"
              :href="txUrl(n.txHash)"
              target="_blank"
              rel="noopener"
              class="mono mt-0.5 inline-block text-xs text-teal hover:underline"
            >
              {{ t('toast.viewTx') }} ↗
            </a>
          </div>
          <button
            class="flex-none text-slate-muted transition hover:text-navy"
            :aria-label="t('common.close')"
            @click="toasts.remove(n.id)"
          >
            ✕
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { txUrl } from '@/lib/constants'
import { useToastsStore, type ToastTone } from '@/stores/toasts'

const { t } = useI18n()
const toasts = useToastsStore()

function border(tone: ToastTone) {
  return { success: 'border-teal-soft', error: 'border-peach', pending: 'border-slate-line' }[tone]
}
function badge(tone: ToastTone) {
  return {
    success: 'bg-teal-mist text-teal-deep',
    error: 'bg-peach text-amber-deep',
    pending: 'bg-slate-panel text-navy-soft',
  }[tone]
}
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
