import { createRouter, createWebHistory } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'
import AppLayout from '@/layouts/AppLayout.vue'
import ConnectLayout from '@/layouts/ConnectLayout.vue'

declare module 'vue-router' {
  interface RouteMeta {
    requiresWallet?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: ConnectLayout,
      children: [
        { path: '', name: 'connect', component: () => import('@/views/ConnectView.vue') },
        { path: 'architecture', name: 'architecture', component: () => import('@/views/ArchitectureView.vue') },
      ],
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresWallet: true },
      children: [
        { path: 'passports', name: 'passports', component: () => import('@/views/PassportsView.vue') },
        { path: 'passports/:id', name: 'passport', component: () => import('@/views/PassportView.vue') },
        { path: 'lots', name: 'lots', component: () => import('@/views/LotsView.vue') },
        { path: 'lots/:id', name: 'lot', component: () => import('@/views/LotView.vue') },
        { path: 'admin', name: 'admin', component: () => import('@/views/AdminView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

/**
 * Une destination interne, et rien d'autre. Pour le navigateur `//exemple.com`
 * est une URL absolue : sans ce filtre, `?redirect=` serait une redirection
 * ouverte, et le QR d'une prothèse — dont l'URL est justement une route
 * profonde — deviendrait un vecteur d'hameçonnage.
 */
export function safeRedirect(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

router.beforeEach((to) => {
  const wallet = useWalletStore()
  if (to.meta.requiresWallet && (!wallet.isConnected || !wallet.isCorrectChain)) {
    // AppKit restaure la session de façon asynchrone : au rechargement d'un
    // lien profond, le wallet est encore « déconnecté » ici. Sans mémoriser la
    // destination, on renverrait sur la liste celui qui vient de scanner le QR
    // d'une prothèse précise.
    return { name: 'connect', query: { redirect: to.fullPath } }
  }
  if (to.name === 'connect' && wallet.isConnected && wallet.isCorrectChain) {
    return safeRedirect(to.query.redirect) ?? { name: 'passports' }
  }
  return true
})

export default router
