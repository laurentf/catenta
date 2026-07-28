<template>
  <RouterView />
  <ToastHost />
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'
import { useCatentaStore } from '@/stores/catenta'
import { useRolesStore } from '@/stores/roles'
import { useCreditsStore } from '@/stores/credits'
import { useActorsStore } from '@/stores/actors'
import ToastHost from '@/components/ui/ToastHost.vue'

const wallet = useWalletStore()
const catenta = useCatentaStore()
const roles = useRolesStore()
const credits = useCreditsStore()
const actors = useActorsStore()
const router = useRouter()

/**
 * Un seul endroit réagit au wallet : découvrir la pile de contrats puis relire
 * les rôles on-chain. Les vues n'ont plus qu'à consommer les stores.
 */
watch(
  () => [wallet.isConnected, wallet.isCorrectChain, wallet.address] as const,
  async ([connected, correctChain]) => {
    if (!connected || !correctChain) {
      roles.reset()
      // Les libellés sont lus sur une chaîne donnée : changer de réseau les périme.
      actors.reset()
      await router.push({ name: 'connect' })
      return
    }
    if (!catenta.ready) await catenta.discover()
    if (catenta.ready) await Promise.all([roles.refresh(), credits.refresh()])
  },
  { immediate: true },
)
</script>
