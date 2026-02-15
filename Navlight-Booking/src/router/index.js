import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
// import Admin from '../views/Admin.vue' // Uncomment if admin panel is added

const routes = [
  { path: '/', name: 'Home', component: Home },
  // { path: '/admin', name: 'Admin', component: Admin }, // Optional
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
