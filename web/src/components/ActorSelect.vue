<template>
  <div>
    <label v-if="label" class="label">{{ label }}</label>
    <select v-if="options.length" :value="modelValue" class="input" @change="onSelect">
      <option value="">{{ placeholder ?? t('actors.choose') }}</option>
      <option v-for="a in options" :key="a.address" :value="a.address">{{ a.display }}</option>
    </select>

    <!-- Repli : si les titulaires ne sont pas encore chargés, ou si l'on veut
         une adresse hors liste, la saisie manuelle reste possible. -->
    <input
      v-else
      :value="modelValue"
      class="input mono"
      placeholder="0x…"
      @input="onType"
    />
    <p v-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { eqAddress, shortAddress } from '@/lib/format'
import type { RoleKey } from '@/lib/contracts'
import { useRolesStore } from '@/stores/roles'
import { useActorsStore } from '@/stores/actors'
import { useWalletStore } from '@/stores/wallet'

/**
 * Choisir un acteur par son NOM, pas par son adresse.
 *
 * Les candidats viennent des titulaires de rôle lus on-chain — c'est le contrat
 * qui dit qui est éligible, jamais l'interface. Le nom vient d'ActorRegistry et
 * n'a aucune autorité : un acteur non inscrit, ou un fabricant qui n'est jamais
 * nommé, s'affiche par son adresse abrégée.
 */
const props = defineProps<{
  modelValue: string
  /** Les rôles dont les titulaires sont proposés. */
  roles: RoleKey[]
  label?: string
  placeholder?: string
  hint?: string
  /** Se proposer soi-même n'a de sens que pour un praticien qui est son propre labo. */
  includeSelf?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const { t } = useI18n()
const roles = useRolesStore()
const actors = useActorsStore()
const wallet = useWalletStore()

// Les titulaires sont énumérables grâce à AccessControlEnumerable : pas
// d'indexeur, une simple lecture.
watchEffect(() => {
  void roles.loadMembers()
})

const options = computed(() => {
  const unique = new Map<string, string>()
  for (const role of props.roles) {
    for (const address of roles.members[role] ?? []) {
      if (!props.includeSelf && eqAddress(address, wallet.address)) continue
      unique.set(address.toLowerCase(), address)
    }
  }
  return [...unique.values()].map((address) => {
    void actors.ensure(address)
    const label = actors.label(address)
    return {
      address,
      display: label ? `${label} — ${shortAddress(address)}` : shortAddress(address),
    }
  })
})

function onSelect(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
function onType(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>
