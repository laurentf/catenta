<template>
  <div class="flex min-h-screen flex-col bg-white">
    <main class="mx-auto flex w-full max-w-3xl flex-1 items-center px-5 py-10">
      <RouterView />
    </main>
    <footer class="pb-8 text-center text-xs text-slate-muted">{{ t('footer') }}</footer>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
