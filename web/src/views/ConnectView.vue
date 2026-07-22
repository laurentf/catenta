<template>
  <div class="w-full">
    <p class="eyebrow">{{ t('connect.eyebrow') }}</p>
    <h1 class="mt-3">{{ t('connect.title') }}</h1>
    <p class="subtitle">{{ t('connect.subtitle') }}</p>

    <div class="mt-8 grid gap-5 sm:grid-cols-2">
      <UiCard tone="mint" :title="t('connect.whatTitle')" badge="◈">
        <ul class="space-y-2.5 text-sm leading-relaxed text-navy">
          <li v-for="i in 4" :key="i" class="flex gap-2">
            <span class="font-bold text-teal">•</span>
            <span v-html="t(`connect.what.${i}`)" />
          </li>
        </ul>
      </UiCard>

      <UiCard tone="panel" :title="t('connect.rolesTitle')" badge="◉" badge-tone="navy">
        <ul class="space-y-2.5 text-sm leading-relaxed text-navy">
          <li v-for="i in 4" :key="i" class="flex gap-2">
            <span class="font-bold text-teal">•</span>
            <span v-html="t(`connect.roles.${i}`)" />
          </li>
        </ul>
      </UiCard>
    </div>

    <div class="mt-8 flex flex-wrap items-center gap-3">
      <UiButton :disabled="!configured" @click="wallet.connect()">
        {{ t('connect.cta') }}
      </UiButton>
      <UiButton v-if="wallet.isConnected && !wallet.isCorrectChain" variant="secondary" @click="wallet.switchChain()">
        {{ t('connect.switch', { chain: CHAIN_NAME }) }}
      </UiButton>
      <span class="text-xs text-slate-muted">{{ t('connect.network', { chain: CHAIN_NAME }) }}</span>
    </div>

    <UiAlert v-if="!configured" tone="warn" class="mt-5">
      <strong>{{ t('connect.notConfiguredTitle') }}</strong>
      {{ t('connect.notConfigured') }}
    </UiAlert>

    <UiAlert v-else-if="wallet.isConnected && !wallet.isCorrectChain" tone="warn" class="mt-5">
      {{ t('connect.wrongChain', { chain: CHAIN_NAME }) }}
    </UiAlert>

    <UiAlert v-if="wallet.error" tone="warn" class="mt-3">{{ wallet.error }}</UiAlert>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
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
