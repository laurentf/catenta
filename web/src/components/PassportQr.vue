<template>
  <div class="flex flex-wrap items-center gap-5">
    <div
      class="flex-none rounded-card bg-white p-3 shadow-card"
      aria-hidden="true"
      v-html="svg"
    />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-bold text-navy">{{ t('qr.title') }}</p>
      <p class="mt-1 text-xs leading-relaxed text-slate-label">{{ t('qr.hint') }}</p>
      <p class="mono mt-3 break-all text-[0.7rem] text-slate-muted">{{ url }}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <UiButton size="sm" variant="ghost" @click="copy">
          {{ copied ? t('qr.copied') : t('qr.copy') }}
        </UiButton>
        <UiButton size="sm" variant="ghost" @click="download">{{ t('qr.download') }}</UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import UiButton from '@/components/ui/UiButton.vue'

/**
 * Le QR du passeport — « tout l'historique en un scan ».
 *
 * Il n'encode aucune donnée : seulement l'URL publique de la fiche. Tout ce
 * qu'un praticien y lira (matière, origine, pose, dent, statut) est relu
 * on-chain à l'ouverture, donc un QR imprimé ne périme jamais et ne peut pas
 * porter d'information fausse ou obsolète.
 *
 * Et surtout : rien d'identifiant n'y transite. L'empreinte patient reste
 * inexploitable sans le secret conservé par le cabinet.
 */
const props = defineProps<{ passportId: number }>()
const { t } = useI18n()

const url = computed(
  () => new URL(`/passports/${props.passportId}`, window.location.origin).toString(),
)

const svg = ref('')
watchEffect(async () => {
  svg.value = await QRCode.toString(url.value, {
    type: 'svg',
    margin: 1,
    width: 148,
    color: { dark: '#0F2540', light: '#FFFFFF' },
  })
})

const copied = ref(false)
async function copy() {
  await navigator.clipboard.writeText(url.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

function download() {
  const blob = new Blob([svg.value], { type: 'image/svg+xml' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = `catenta-passeport-${props.passportId}.svg`
  a.click()
  URL.revokeObjectURL(href)
}
</script>
