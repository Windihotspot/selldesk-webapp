import Login from '@/views/Login.vue'
import { createRouter, createWebHistory } from 'vue-router'


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: Login
    }
    
  ]
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  const isAuthenticated = !!authStore.token

  if (to.meta.requiresAuth && !isAuthenticated) {
    return next('/login')
  }

  next()
})

export default router
