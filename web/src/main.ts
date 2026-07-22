import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import './assets/styles/main.css'
import App from './App.vue'
import router from './router'
import { initAppKit } from './lib/appkit'

import en from './locales/en.json'
import fr from './locales/fr.json'

initAppKit()

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('catenta-locale') || 'fr',
  fallbackLocale: 'fr',
  // Contenu 100 % statique, aucune entrée utilisateur : le HTML des messages
  // (mise en gras) est maîtrisé, pas un vecteur XSS. On assume le choix.
  warnHtmlMessage: false,
  messages: { en, fr },
})

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
