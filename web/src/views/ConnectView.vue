<template>
  <div class="w-full py-4">
    <!-- Héro : le diamant qui flotte + la baseline -->
    <div class="flex flex-col items-center text-center">
      <img src="/logo.svg" alt="Catenta" class="gem-float h-24 w-auto" />
      <h1 class="wordmark mt-5 text-5xl sm:text-6xl">catenta</h1>
      <p class="mt-4 max-w-xl text-lg text-slate-label">{{ t('connect.tagline') }}</p>

      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <UiButton :disabled="!configured" @click="wallet.connect()">
          {{ t('connect.cta') }}
        </UiButton>
        <UiButton
          v-if="wallet.isConnected && !wallet.isCorrectChain"
          variant="secondary"
          @click="wallet.switchChain()"
        >
          {{ t('connect.switch', { chain: CHAIN_NAME }) }}
        </UiButton>
      </div>
      <p class="mt-3 text-xs text-slate-muted">{{ t('connect.network', { chain: CHAIN_NAME }) }}</p>
      <RouterLink
        :to="{ name: 'architecture' }"
        class="mt-4 text-sm font-semibold text-teal transition hover:text-teal-deep"
      >
        {{ t('connect.learnMore') }} →
      </RouterLink>
    </div>

    <!-- Trois lignes de valeur, compactes -->
    <div class="mt-12 grid gap-4 sm:grid-cols-3">
      <div v-for="i in 3" :key="i" class="rounded-card bg-teal-mist p-5 text-center">
        <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-teal-accent text-lg text-white">
          {{ ['◈', '⚑', '◉'][i - 1] }}
        </div>
        <p class="mt-3 text-sm leading-relaxed text-navy" v-html="t(`connect.value.${i}`)" />
      </div>
    </div>

    <UiAlert v-if="!configured" tone="warn" class="mt-8">
      <strong>{{ t('connect.notConfiguredTitle') }}</strong>
      {{ t('connect.notConfigured') }}
    </UiAlert>
    <UiAlert v-else-if="wallet.isConnected && !wallet.isCorrectChain" tone="warn" class="mt-8">
      {{ t('connect.wrongChain', { chain: CHAIN_NAME }) }}
    </UiAlert>
    <UiAlert v-if="wallet.error" tone="warn" class="mt-3">{{ wallet.error }}</UiAlert>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import { CHAIN_NAME, isConfigured } from '@/lib/constants'
import { useWalletStore } from '@/stores/wallet'

const { t } = useI18n()
const router = useRouter()
const wallet = useWalletStore()
const configured = isConfigured()

// Le guard du router ne redirige connect -> passports que lors d'une
// navigation. Après une connexion il n'y en a pas : on pousse nous-mêmes dès
// que le wallet passe connecté ET sur le bon réseau.
watch(
  () => [wallet.isConnected, wallet.isCorrectChain] as const,
  ([connected, ok]) => {
    if (connected && ok) router.push({ name: 'passports' })
  },
  { immediate: true },
)
</script>
