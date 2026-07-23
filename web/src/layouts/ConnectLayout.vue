<template>
  <div class="flex min-h-screen flex-col bg-white">
    <header class="mx-auto flex w-full max-w-5xl items-center justify-end px-5 pt-5">
      <button
        class="rounded-md px-2 py-1 text-xs font-bold uppercase text-slate-muted transition hover:text-teal"
        @click="toggleLocale"
      >
        {{ locale === 'fr' ? 'EN' : 'FR' }}
      </button>
    </header>

    <main class="mx-auto flex w-full max-w-3xl flex-1 items-start px-5 py-6">
      <RouterView />
    </main>

    <footer class="pb-8 text-center text-xs text-slate-muted">{{ t('footer') }}</footer>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

function toggleLocale() {
  locale.value = locale.value === 'fr' ? 'en' : 'fr'
  localStorage.setItem('catenta-locale', locale.value)
}
</script>
