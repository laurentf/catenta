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
              <dd class="min-w-0">
                <!-- Vers LE lot, pas vers la liste : c'est le lien matière → dispositif -->
                <RouterLink
                  :to="{ name: 'lot', params: { id: p.lotId } }"
                  class="block truncate text-right font-semibold text-teal hover:underline"
                >
                  #{{ p.lotId }}
                </RouterLink>
              </dd>
            </div>
            <div class="flex items-center justify-between gap-2">
              <dt class="text-slate-label">{{ t('passport.consumed') }}</dt>
              <dd class="font-semibold text-navy-soft">
                {{ formatQuantity(p.quantity, consumedUnit) }}
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
            <template v-if="isPlaced">
              <div class="flex items-center justify-between gap-2">
                <dt class="text-slate-label">{{ t('passport.tooth') }}</dt>
                <dd class="font-semibold text-navy">
                  {{ t('passport.toothValue', { tooth: p.tooth }) }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-slate-label">{{ t('passport.placedAt') }}</dt>
                <dd class="text-navy-soft">{{ formatDate(p.placedAt) }}</dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-slate-label">{{ t('passport.placedBy') }}</dt>
                <dd><AddressChip :address="p.practitioner" /></dd>
              </div>
            </template>
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
            :disabled="!a.free && !credits.canAfford"
            @click="a.run()"
          >
            {{ t(`passport.actions.${a.key}`) }}
          </UiButton>
        </div>

        <p v-if="!credits.canAfford" class="mt-3 text-xs font-semibold text-amber-deep">
          {{ t('credits.insufficient', { cost: credits.actionCost, balance: credits.balance }) }}
        </p>

        <!-- Handoff : on désigne un destinataire nominatif -->
        <form v-if="showHandoff" class="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]" @submit.prevent="doInitiate">
          <div>
            <label class="label">{{ t('passport.handoffLabel') }}</label>
            <input
              v-model="recipient"
              class="input mono"
              list="handoff-recipients"
              placeholder="0x…"
            />
            <!-- Les acteurs éligibles sont lus on-chain, pas décidés ici -->
            <datalist id="handoff-recipients">
              <option v-for="address in eligible" :key="address" :value="address" />
            </datalist>
            <p class="hint">
              {{ p.pendingHandoff ? t('passport.handoffReplace') : t('passport.handoffHint') }}
            </p>
          </div>
          <UiButton
            type="submit"
            class="self-start sm:mt-6"
            :loading="busy === 'initiate'"
            :disabled="!isAddress(recipient) || !credits.canAfford"
          >
            {{ t(`passport.actions.${p.pendingHandoff ? 'redirect' : 'initiate'}`) }}
          </UiButton>
        </form>

        <!-- Pose : l'empreinte anonyme du patient se construit ici -->
        <div v-if="showPlace" class="mt-5">
          <div class="mb-5 max-w-xs">
            <label class="label">{{ t('passport.toothLabel') }}</label>
            <input
              v-model="tooth"
              class="input"
              type="number"
              min="11"
              max="88"
              step="1"
              placeholder="26"
            />
            <p class="hint">{{ t('passport.toothHint') }}</p>
          </div>
          <CommitmentBuilder v-model="commitment" />
          <UiButton
            class="mt-4"
            :loading="busy === 'place'"
            :disabled="!commitment || !isValidTooth || !credits.canAfford"
            @click="doPlace"
          >
            {{ t('passport.actions.place') }}
          </UiButton>
        </div>

      </UiCard>

      <!-- Le QR : la fiche entière tient dans un scan, rien n'y est encodé -->
      <UiCard class="mt-5" :title="t('qr.cardTitle')" badge="▤">
        <PassportQr :passport-id="p.id" />
      </UiCard>

      <UiAlert v-if="p.pendingHandoff" :tone="isPending ? 'info' : 'warn'" class="mt-5">
        {{ isPending ? t('passport.pendingForMe') : t('passport.pendingFor') }}
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
import PassportQr from '@/components/PassportQr.vue'
import { Status, parseError } from '@/lib/contracts'
import { ZERO_ADDRESS } from '@/lib/constants'
import { eqAddress, formatDate, formatQuantity, isAddress } from '@/lib/format'
import { useCatentaStore } from '@/stores/catenta'
import { usePassportsStore } from '@/stores/passports'
import { useLotsStore } from '@/stores/lots'
import { useToastsStore } from '@/stores/toasts'
import { useRolesStore } from '@/stores/roles'
import { useWalletStore } from '@/stores/wallet'
import { useCreditsStore } from '@/stores/credits'

const { t } = useI18n()
const route = useRoute()
const catenta = useCatentaStore()
const passports = usePassportsStore()
const toasts = useToastsStore()
const roles = useRolesStore()
const wallet = useWalletStore()
const credits = useCreditsStore()
const lots = useLotsStore()

const id = computed(() => Number(route.params.id))
const p = computed(() => passports.current)

const busy = ref<string | null>(null)
const showHandoff = ref(false)
const showPlace = ref(false)
const recipient = ref('')
const commitment = ref('')
const tooth = ref('')

/** L'unité vient du catalogue on-chain, via le lot d'origine du passeport. */
const consumedUnit = computed(
  () => lots.list.find((l) => l.id === p.value?.lotId)?.unit ?? '',
)

const isPlaced = computed(() => p.value?.status === Status.Placed)

/** Notation FDI : quadrant 1-8, position 1-8 — le contrat vérifie la même chose. */
const isValidTooth = computed(() => {
  const n = Number(tooth.value)
  if (!Number.isInteger(n)) return false
  const quadrant = Math.floor(n / 10)
  const position = n % 10
  return quadrant >= 1 && quadrant <= 8 && position >= 1 && position <= 8
})

const isHolder = computed(() => eqAddress(p.value?.holder, wallet.address))
const isPending = computed(() => eqAddress(p.value?.pendingHandoff, wallet.address))
const hasCommitment = computed(
  () => !!p.value?.patientCommitment && p.value.patientCommitment !== ZERO_ADDRESS.padEnd(66, '0'),
)

/**
 * Les destinataires que le contrat accepterait : titulaires de LAB ou
 * PRACTITIONER, lus on-chain (AccessControlEnumerable). La saisie reste libre —
 * la liste est une aide, pas une autorisation.
 */
const eligible = computed(() => {
  const unique = new Map<string, string>()
  for (const address of [...(roles.members.LAB ?? []), ...(roles.members.PRACTITIONER ?? [])]) {
    if (eqAddress(address, wallet.address)) continue // remise à soi-même refusée
    unique.set(address.toLowerCase(), address)
  }
  return [...unique.values()]
})

const steps = computed(() => {
  const s = p.value?.status ?? Status.Manufactured
  return [
    { key: 'manufactured', index: 1, done: true },
    { key: 'certified', index: 2, done: s >= Status.Certified },
    { key: 'placed', index: 3, done: s >= Status.Placed },
  ]
})

type Action = {
  key: string
  variant?: 'primary' | 'secondary' | 'ghost'
  /** Sans coût en crédit — seule l'acceptation d'une remise l'est. */
  free?: boolean
  run: () => void
}

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
    out.push({
      key: 'accept',
      free: true,
      run: () => run('accept', () => passports.acceptHandoff(id.value)),
    })
  }
  // Une remise déjà armée reste redirigeable : `armHandoff` écrase la
  // désignation précédente. La masquer gèlerait le passeport sur une adresse
  // saisie de travers, jusqu'à ce que ce destinataire-là veuille bien accepter.
  if (isHolder.value && passport.status !== Status.Placed) {
    out.push({
      key: passport.pendingHandoff ? 'redirect' : 'initiate',
      variant: 'secondary',
      run: () => {
        showHandoff.value = !showHandoff.value
        showPlace.value = false
        if (showHandoff.value) void roles.loadMembers()
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
  try {
    await toasts.run(fn, {
      pending: t('toast.pending'),
      success: t('common.done'),
      error: (err) => t(parseError(err).key),
    })
    showHandoff.value = false
    showPlace.value = false
    recipient.value = ''
    commitment.value = ''
    tooth.value = ''
  } catch {
    /* toast déjà affiché */
  } finally {
    busy.value = null
  }
}

const doInitiate = () =>
  run('initiate', () => passports.initiateHandoff(id.value, recipient.value.trim()))
const doPlace = () =>
  run('place', () => passports.markPlaced(id.value, Number(tooth.value), commitment.value))

function load() {
  if (!catenta.ready) return
  void passports.loadOne(id.value)
  // Lots et catalogue : de quoi nommer la matière et son unité.
  void Promise.all([lots.load()])
}
onMounted(load)
watch(() => [catenta.ready, route.params.id], load)
</script>
