<template>
  <a
    :href="addressUrl(address)"
    target="_blank"
    rel="noopener"
    :title="title"
    :class="[
      'inline-flex items-center gap-1.5 rounded-md bg-slate-panel px-2 py-1',
      'text-navy-soft transition hover:bg-teal-soft hover:text-teal-deep',
      entry ? 'font-semibold' : 'mono',
    ]"
  >
    <span v-if="isMe" class="h-1.5 w-1.5 rounded-full bg-teal-accent" aria-hidden="true" />
    {{ entry?.label ?? shortAddress(address) }}
  </a>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { addressUrl } from '@/lib/constants'
import { eqAddress, shortAddress } from '@/lib/format'
import { useWalletStore } from '@/stores/wallet'
import { useActorsStore } from '@/stores/actors'

const props = defineProps<{ address: string }>()
const wallet = useWalletStore()
const actors = useActorsStore()

const isMe = computed(() => eqAddress(props.address, wallet.address))

/**
 * Le nom vient d'ActorRegistry, écrit par l'agent d'agrément. Il n'a aucune
 * autorité sur le registre : l'adresse reste ce que la chaîne connaît, et elle
 * reste visible en infobulle et derrière le lien.
 *
 * Un fabricant n'est jamais nommé — le contrat le refuse — donc son adresse
 * s'affiche telle quelle, comme pour toute adresse hors du registre.
 */
watchEffect(() => {
  void actors.ensure(props.address)
})

const entry = computed(() => actors.get(props.address))
const title = computed(() => {
  const e = entry.value
  if (!e) return props.address
  return [e.label, e.siren && `SIREN ${e.siren}`, props.address].filter(Boolean).join(' — ')
})
</script>
