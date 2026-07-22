<template>
  <div>
    <label class="label">{{ t('commitment.identityLabel') }}</label>
    <input
      v-model="identity"
      class="input"
      :placeholder="t('commitment.identityPlaceholder')"
      @input="onIdentity"
    />
    <p class="hint">{{ t('commitment.identityHint') }}</p>

    <div v-if="salt" class="mt-4 rounded-card bg-peach p-4">
      <p class="text-xs font-extrabold uppercase tracking-wider text-amber-deep">
        {{ t('commitment.saltTitle') }}
      </p>
      <p class="mt-1.5 text-xs leading-relaxed text-amber-deep">
        {{ t('commitment.saltWarning') }}
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <HashChip :value="salt" />
        <UiButton size="sm" variant="ghost" @click="download">
          {{ t('commitment.download') }}
        </UiButton>
        <UiButton size="sm" variant="ghost" @click="regenerate">
          {{ t('commitment.regenerate') }}
        </UiButton>
      </div>
    </div>

    <div v-if="modelValue" class="mt-3 flex items-center gap-2">
      <span class="text-xs font-semibold text-teal-deep">{{ t('commitment.result') }}</span>
      <HashChip :value="modelValue" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import HashChip from './ui/HashChip.vue'
import UiButton from './ui/UiButton.vue'
import { makeCommitment } from '@/lib/hash'

/**
 * L'engagement patient, et le sel qui va avec.
 *
 * Le sel est généré ici, affiché, et l'utilisateur est invité à le conserver
 * hors chaîne — parce que sans lui, l'engagement est un hash d'état civil,
 * donc cassable par force brute, donc toujours une donnée personnelle.
 * Corollaire voulu : effacer la fiche patient détruit le sel et rend
 * l'engagement on-chain définitivement inexploitable. C'est ce qui rend le
 * droit à l'effacement compatible avec l'immuabilité de la chaîne.
 */
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string]; salt: [string] }>()
const { t } = useI18n()

const identity = ref('')
const salt = ref('')

function compute() {
  const value = identity.value.trim()
  if (!value) {
    salt.value = ''
    emit('update:modelValue', '')
    return
  }
  const made = makeCommitment(value)
  salt.value = made.salt
  emit('salt', made.salt)
  emit('update:modelValue', made.commitment)
}

let timer: ReturnType<typeof setTimeout> | undefined
function onIdentity() {
  clearTimeout(timer)
  // debounce : sinon un nouveau sel est tiré à chaque frappe
  timer = setTimeout(compute, 350)
}

function regenerate() {
  compute()
}

function download() {
  const payload = JSON.stringify(
    { identity: identity.value.trim(), salt: salt.value, note: t('commitment.fileNote') },
    null,
    2,
  )
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `catenta-secret-patient-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>
