<template>
  <div class="w-full py-2">
    <RouterLink
      :to="{ name: backTo }"
      class="text-xs font-semibold text-slate-muted transition hover:text-teal"
    >
      ← {{ t('common.back') }}
    </RouterLink>

    <div class="mt-4 flex items-center gap-3">
      <img src="/logo.svg" alt="" class="h-9 w-auto" />
      <h1 class="wordmark text-3xl">catenta</h1>
    </div>
    <p class="subtitle">{{ t('arch.subtitle') }}</p>

    <!-- Un standard de token par besoin -->
    <h2 class="mt-8">{{ t('arch.tokensTitle') }}</h2>
    <p class="subtitle">{{ t('arch.tokensSubtitle') }}</p>
    <div class="mt-5 space-y-3">
      <div
        v-for="tk in tokens"
        :key="tk.key"
        class="flex flex-col gap-2 rounded-card border border-slate-line p-4 sm:flex-row sm:items-center sm:gap-5"
      >
        <div class="flex-none">
          <span
            class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold"
            :class="tk.soon ? 'bg-slate-panel text-slate-label' : 'bg-teal-soft text-teal-deep'"
          >
            <span>{{ tk.glyph }}</span> {{ tk.std }}
          </span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold text-navy">
            {{ t(`arch.tokens.${tk.key}.need`) }}
            <span v-if="tk.soon" class="ml-1 text-xs font-semibold text-amber-deep">· {{ t('arch.soon') }}</span>
          </p>
          <p class="text-sm leading-relaxed text-slate-label">{{ t(`arch.tokens.${tk.key}.why`) }}</p>
        </div>
      </div>
    </div>

    <!-- Ce que fait le registre + les acteurs -->
    <div class="mt-10 grid gap-5 sm:grid-cols-2">
      <UiCard tone="mint" :title="t('arch.whatTitle')" badge="◈">
        <ul class="space-y-2.5 text-sm leading-relaxed text-navy">
          <li v-for="i in 4" :key="i" class="flex gap-2">
            <span class="font-bold text-teal">•</span>
            <span v-html="t(`connect.what.${i}`)" />
          </li>
        </ul>
      </UiCard>
      <UiCard tone="panel" :title="t('arch.rolesTitle')" badge="◉" badge-tone="navy">
        <ul class="space-y-2.5 text-sm leading-relaxed text-navy">
          <li v-for="i in 4" :key="i" class="flex gap-2">
            <span class="font-bold text-teal">•</span>
            <span v-html="t(`connect.roles.${i}`)" />
          </li>
        </ul>
      </UiCard>
    </div>

    <!-- Le principe d'architecture -->
    <UiCard class="mt-5" :title="t('arch.layersTitle')" badge="▤">
      <p class="text-sm leading-relaxed text-navy-soft" v-html="t('arch.layers')" />
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
import { useWalletStore } from '@/stores/wallet'

const { t } = useI18n()
const wallet = useWalletStore()

// retour vers l'app si connecté, sinon l'accueil
const backTo = computed(() =>
  wallet.isConnected && wallet.isCorrectChain ? 'passports' : 'connect',
)

const tokens = [
  { key: 'passport', std: 'ERC-721', glyph: '◈', soon: false },
  { key: 'lots', std: 'ERC-1155', glyph: '▦', soon: false },
  { key: 'credit', std: 'ERC-20', glyph: '◆', soon: false },
  { key: 'bond', std: 'ERC-20', glyph: '⚖', soon: true },
] as const
</script>
