<template>
  <a
    :href="addressUrl(address)"
    target="_blank"
    rel="noopener"
    :title="address"
    class="mono inline-flex items-center gap-1.5 rounded-md bg-slate-panel px-2 py-1
           text-navy-soft transition hover:bg-teal-soft hover:text-teal-deep"
  >
    <span v-if="isMe" class="h-1.5 w-1.5 rounded-full bg-teal-accent" aria-hidden="true" />
    {{ shortAddress(address) }}
  </a>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { addressUrl } from '@/lib/constants'
import { eqAddress, shortAddress } from '@/lib/format'
import { useWalletStore } from '@/stores/wallet'

const props = defineProps<{ address: string }>()
const wallet = useWalletStore()
const isMe = computed(() => eqAddress(props.address, wallet.address))
</script>
