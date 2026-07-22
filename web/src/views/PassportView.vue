<template>
  <div>
    <RouterLink :to="{ name: 'passports' }" class="text-xs font-semibold text-slate-muted hover:text-teal">
      ← {{ t('common.back') }}
    </RouterLink>

    <div v-if="passports.loading" class="mt-6 text-sm text-slate-muted">{{ t('common.loading') }}</div>

    <UiAlert v-else-if="!p" tone="warn" class="mt-6">{{ t('errors.unknownPassport') }}</UiAlert>

    <template v-else>
      <div class="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="eyebrow">{{ t('passport.eyebrow') }}</p>
          <h1 class="mt-2">{{ t('passports.passport') }} #{{ p.id }}</h1>
          <p class="subtitle">{{ t('passport.subtitle') }}</p>
        </div>
        <StatusBadge :status="p.status" />
      </div>

      <div class="mt-8 grid gap-5 lg:grid-cols-3">
        <!-- Timeline : la machine à états, rendue lisible -->
        <UiCard class="lg:col-span-2" :title="t('passport.timelineTitle')" badge="⟶">
          <ol class="space-y-4">
            <li v-for="step in steps" :key="step.key" class="flex gap-4">
              <span
                :class="[
                  'mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold',
                  step.done ? 'bg-teal text-white' : 'bg-slate-panel text-slate-muted',
                ]"
              >
                {{ step.done ? '✓' : step.index }}
              </span>
              <div class="min-w-0">
                <p :class="['text-sm font-bold', step.done ? 'text-navy' : 'text-slate-muted']">
                  {{ t(`passport.steps.${step.key}.title`) }}
                </p>
                <p class="text-xs leading-relaxed text-slate-label">
                  {{ t(`passport.steps.${step.key}.desc`) }}
                </p>
              </div>
            </li>
          </ol>
        </UiCard>

        <UiCard tone="panel" :title="t('passport.factsTitle')" badge="≡" badge-tone="navy">
          <dl class="space-y-3 text-xs">
            <div class="flex items-center justify-between gap-2">
              <dt class="text-slate-label">{{ t('passports.holder') }}</dt>
              <dd><AddressChip :address="p.holder" /></dd>
            </div>
            <div class="flex items-center justify-between gap-2">
              <dt class="text-slate-label">{{ t('passports.lot') }}</dt>
              <dd>
                <RouterLink :to="{ name: 'lots' }" class="font-semibold text-teal hover:underline">
                  #{{ p.lotId }}
                </RouterLink>
              </dd>
            </div>
            <div class="flex items-center justify-between gap-2">
              <dt class="text-slate-label">{{ t('passports.mintedAt') }}</dt>
              <dd class="text-navy-soft">{{ formatDate(p.mintedAt) }}</dd>
            </div>
            <div class="flex items-center justify-between gap-2">
              <dt class="text-slate-label">{{ t('passport.conformity') }}</dt>
              <dd><HashChip :value="p.conformityHash" /></dd>
            </div>
            <div v-if="hasCommitment" class="flex items-center justify-between gap-2">
              <dt class="text-slate-label">{{ t('passport.commitment') }}</dt>
              <dd><HashChip :value="p.patientCommitment" /></dd>
            </div>
          </dl>
          <p v-if="hasCommitment" class="hint mt-4">{{ t('passport.commitmentHint') }}</p>
        </UiCard>
      </div>

      <!-- Actions, strictement selon le rôle ET le statut lus on-chain -->
      <UiCard v-if="actions.length" tone="mint" class="mt-5" :title="t('passport.actionsTitle')" badge="▸">
        <div class="flex flex-wrap gap-3">
          <UiButton
            v-for="a in actions"
            :key="a.key"
            :variant="a.variant"
            :loading="busy === a.key"
            @click="a.run()"
          >
            {{ t(`passport.actions.${a.key}`) }}
          </UiButton>
        </div>

        <!-- Handoff : on désigne un destinataire nominatif -->
        <form v-if="showHandoff" class="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]" @submit.prevent="doInitiate">
          <div>
            <label class="label">{{ t('passport.handoffLabel') }}</label>
            <input v-model="recipient" class="input mono" placeholder="0x…" />
            <p class="hint">{{ t('passport.handoffHint') }}</p>
          </div>
          <UiButton type="submit" class="self-start sm:mt-6" :loading="busy === 'initiate'" :disabled="!isAddress(recipient)">
            {{ t('passport.actions.initiate') }}
          </UiButton>
        </form>

        <!-- Pose : l'empreinte anonyme du patient se construit ici -->
        <div v-if="showPlace" class="mt-5">
          <CommitmentBuilder v-model="commitment" />
          <UiButton class="mt-4" :loading="busy === 'place'" :disabled="!commitment" @click="doPlace">
            {{ t('passport.actions.place') }}
          </UiButton>
        </div>

        <p v-if="feedback" class="mt-4 text-sm" :class="ok ? 'text-teal-deep' : 'text-amber-deep'">
          {{ feedback }}
        </p>
      </UiCard>

      <UiAlert v-if="p.pendingHandoff" tone="warn" class="mt-5">
        {{ t('passport.pendingFor') }}
        <AddressChip :address="p.pendingHandoff" />
      </UiAlert>

      <UiAlert v-if="!actions.length && !p.pendingHandoff" tone="info" class="mt-5">
        {{ t('passport.nothingToDo') }}
      </UiAlert>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UiCard from '@/components/ui/UiCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiAlert from '@/components/ui/UiAlert.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import AddressChip from '@/components/ui/AddressChip.vue'
import HashChip from '@/components/ui/HashChip.vue'
import CommitmentBuilder from '@/components/CommitmentBuilder.vue'
import { Status, parseError } from '@/lib/contracts'
import { ZERO_ADDRESS } from '@/lib/constants'
import { eqAddress, formatDate, isAddress } from '@/lib/format'
import { useCatentaStore } from '@/stores/catenta'
import { usePassportsStore } from '@/stores/passports'
import { useRolesStore } from '@/stores/roles'
import { useWalletStore } from '@/stores/wallet'

const { t } = useI18n()
const route = useRoute()
const catenta = useCatentaStore()
const passports = usePassportsStore()
const roles = useRolesStore()
const wallet = useWalletStore()

const id = computed(() => Number(route.params.id))
const p = computed(() => passports.current)

const busy = ref<string | null>(null)
const feedback = ref('')
const ok = ref(false)
const showHandoff = ref(false)
const showPlace = ref(false)
const recipient = ref('')
const commitment = ref('')

const isHolder = computed(() => eqAddress(p.value?.holder, wallet.address))
const isPending = computed(() => eqAddress(p.value?.pendingHandoff, wallet.address))
const hasCommitment = computed(
  () => !!p.value?.patientCommitment && p.value.patientCommitment !== ZERO_ADDRESS.padEnd(66, '0'),
)

const steps = computed(() => {
  const s = p.value?.status ?? Status.Manufactured
  return [
    { key: 'manufactured', index: 1, done: true },
    { key: 'certified', index: 2, done: s >= Status.Certified },
    { key: 'placed', index: 3, done: s >= Status.Placed },
  ]
})

type Action = { key: string; variant?: 'primary' | 'secondary' | 'ghost'; run: () => void }

/**
 * Les actions proposées croisent le rôle ET le statut, tous deux lus on-chain.
 * L'interface ne fait que refléter ce que le contrat accepterait : elle ne
 * s'accorde aucun droit, et un bouton absent n'est jamais une sécurité — le
 * contrat reste seul juge.
 */
const actions = computed<Action[]>(() => {
  const passport = p.value
  if (!passport) return []
  const out: Action[] = []

  if (isPending.value) {
    out.push({ key: 'accept', run: () => run('accept', () => passports.acceptHandoff(id.value)) })
  }
  if (isHolder.value && !passport.pendingHandoff && passport.status !== Status.Placed) {
    out.push({
      key: 'initiate',
      variant: 'secondary',
      run: () => {
        showHandoff.value = !showHandoff.value
        showPlace.value = false
      },
    })
  }
  if (isHolder.value && roles.isPractitioner && passport.status === Status.Manufactured) {
    out.push({ key: 'attest', run: () => run('attest', () => passports.attestConformity(id.value)) })
  }
  if (isHolder.value && roles.isPractitioner && passport.status === Status.Certified) {
    out.push({
      key: 'openPlace',
      run: () => {
        showPlace.value = !showPlace.value
        showHandoff.value = false
      },
    })
  }
  return out
})

async function run(key: string, fn: () => Promise<string>) {
  busy.value = key
  feedback.value = ''
  try {
    await fn()
    ok.value = true
    feedback.value = t('common.done')
    showHandoff.value = false
    showPlace.value = false
    recipient.value = ''
    commitment.value = ''
  } catch (err) {
    ok.value = false
    const { key: msgKey, raw } = parseError(err)
    feedback.value = raw ? `${t(msgKey)} (${raw})` : t(msgKey)
  } finally {
    busy.value = null
  }
}

const doInitiate = () =>
  run('initiate', () => passports.initiateHandoff(id.value, recipient.value.trim()))
const doPlace = () => run('place', () => passports.markPlaced(id.value, commitment.value))

function load() {
  if (catenta.ready) void passports.loadOne(id.value)
}
onMounted(load)
watch(() => [catenta.ready, route.params.id], load)
</script>
