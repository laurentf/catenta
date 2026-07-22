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
        { path: 'admin', name: 'admin', component: () => import('@/views/AdminView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const wallet = useWalletStore()
  if (to.meta.requiresWallet && (!wallet.isConnected || !wallet.isCorrectChain)) {
    return { name: 'connect' }
  }
  if (to.name === 'connect' && wallet.isConnected && wallet.isCorrectChain) {
    return { name: 'passports' }
  }
  return true
})

export default router
