<template>
  <div class="min-h-screen bg-white">
    <header class="border-b border-slate-line bg-white/90 backdrop-blur">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-4">
        <RouterLink to="/passports" class="flex items-center gap-2.5">
          <img src="/logo.svg" alt="" class="gem-float h-8 w-auto" />
          <span class="wordmark text-2xl">catenta</span>
        </RouterLink>

        <nav class="flex flex-1 flex-wrap items-center gap-1">
          <RouterLink
            v-for="link in links"
            :key="link.name"
            :to="{ name: link.name }"
            class="rounded-md px-3 py-1.5 text-sm font-semibold text-navy-soft transition
                   hover:bg-teal-soft hover:text-teal-deep"
            active-class="bg-teal-soft text-teal-deep"
          >
            {{ t(`nav.${link.name}`) }}
          </RouterLink>
        </nav>

        <div class="flex items-center gap-2">
          <span
            v-if="!roles.isSpectator"
            class="inline-flex items-center gap-1.5 rounded-full bg-navy px-2.5 py-1
                   text-[0.7rem] font-bold text-white"
            :title="t('credits.tooltip', { cost: credits.actionCost })"
          >
            <span class="text-teal-accent">◈</span>
            {{ credits.balance }} {{ t('credits.unit') }}
          </span>
          <span
            v-for="role in roles.myRoles"
            :key="role"
            class="rounded-full bg-teal-soft px-2.5 py-1 text-[0.68rem] font-bold
                   uppercase tracking-wider text-teal-deep"
          >
            {{ t(`roles.${role}`) }}
          </span>
          <span
            v-if="roles.isSpectator"
            class="rounded-full bg-slate-panel px-2.5 py-1 text-[0.68rem] font-bold
                   uppercase tracking-wider text-navy-soft"
          >
            {{ t('roles.SPECTATOR') }}
          </span>

          <button
            class="rounded-md px-2 py-1 text-xs font-bold uppercase text-slate-muted
                   transition hover:text-teal"
            @click="toggleLocale"
          >
            {{ locale === 'fr' ? 'EN' : 'FR' }}
          </button>

          <UiButton size="sm" variant="ghost" @click="wallet.disconnect()">
            {{ shortAddress(wallet.address) }}
          </UiButton>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-5 py-8">
      <RouterView />
    </main>

    <footer class="mx-auto max-w-6xl px-5 pb-10 pt-4 text-center text-xs text-slate-muted">
      {{ t('footer') }}
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import { shortAddress } from '@/lib/format'
import { useWalletStore } from '@/stores/wallet'
import { useRolesStore } from '@/stores/roles'
import { useCreditsStore } from '@/stores/credits'

const { t, locale } = useI18n()
const wallet = useWalletStore()
const roles = useRolesStore()
const credits = useCreditsStore()

const links = computed(() => {
  const base = [{ name: 'passports' }, { name: 'lots' }]
  return roles.isAdmin || roles.isRegistrar ? [...base, { name: 'admin' }] : base
})

function toggleLocale() {
  locale.value = locale.value === 'fr' ? 'en' : 'fr'
  localStorage.setItem('catenta-locale', locale.value)
}
</script>
