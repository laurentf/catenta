<template>
  <div>
    <label class="label">{{ label }}</label>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="m in modes"
        :key="m"
        type="button"
        :class="[
          'rounded-md px-2.5 py-1 text-xs font-semibold transition',
          mode === m ? 'bg-teal text-white' : 'bg-slate-panel text-navy-soft hover:bg-teal-soft',
        ]"
        @click="setMode(m)"
      >
        {{ t(`hashInput.mode.${m}`) }}
      </button>
    </div>

    <div class="mt-2.5">
      <input
        v-if="mode === 'file'"
        type="file"
        class="input file:mr-3 file:rounded-md file:border-0 file:bg-teal-soft file:px-3
               file:py-1.5 file:text-xs file:font-semibold file:text-teal-deep"
        @change="onFile"
      />
      <input
        v-else-if="mode === 'text'"
        v-model="text"
        class="input"
        :placeholder="t('hashInput.textPlaceholder')"
        @input="onText"
      />
      <input
        v-else
        v-model="raw"
        class="input mono"
        placeholder="0x…"
        @input="onRaw"
      />
    </div>

    <p class="hint">{{ t(`hashInput.hint.${mode}`) }}</p>

    <div v-if="modelValue" class="mt-2 flex items-center gap-2">
      <span class="text-xs font-semibold text-teal-deep">{{ t('hashInput.result') }}</span>
      <HashChip :value="modelValue" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import HashChip from './ui/HashChip.vue'
import { hashFile, hashText, isHash32 } from '@/lib/hash'

/**
 * Empreinte d'un document, calculée ENTIÈREMENT dans le navigateur : le
 * fichier ne quitte jamais le poste, seule son empreinte monte on-chain.
 * C'est la mise en œuvre concrète du stockage hybride — la pièce reste chez
 * son détenteur, la chaîne n'en ancre que la preuve d'intégrité.
 */
defineProps<{ label: string; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const { t } = useI18n()

const modes = ['file', 'text', 'raw'] as const
type Mode = (typeof modes)[number]

const mode = ref<Mode>('file')
const text = ref('')
const raw = ref('')

function setMode(m: Mode) {
  mode.value = m
  emit('update:modelValue', '')
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return emit('update:modelValue', '')
  emit('update:modelValue', await hashFile(file))
}

function onText() {
  emit('update:modelValue', text.value.trim() ? hashText(text.value.trim()) : '')
}

function onRaw() {
  const v = raw.value.trim()
  emit('update:modelValue', isHash32(v) ? v : '')
}
</script>
