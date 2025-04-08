import { createRouter, createWebHistory } from "vue-router";
import Login from "../views/LoginView.vue";
import { jwtDecode } from 'jwt-decode';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/login", // 默认重定向到 /login
    },
    {
      path: "/login",
      name: "login",
      component: Login,
    },
    {
      path: "/chat",
      name: "chat",
      component: () => import("../views/ChatRoom.vue"),
    },
    {
      path: "/register",
      name: "register",
      component: () => import("../views/RegisterView.vue"),
    },
  ],
});

router.beforeEach(async (to, from, next) => {
  const token = localStorage.getItem('token');
  const isAuthRoute = ['login', 'register'].includes(to.name);

  if (token) {
    try {
      const { exp, username } = jwtDecode(token);
      if (Date.now() >= exp * 1000) throw new Error('Token 过期');
      
      // 验证服务器端是否存在该用户
      const res = await fetch(`http://localhost:3000/api/validate?user=${username}`);
      if (!res.ok) throw new Error('用户不存在');
      
      return isAuthRoute ? next('/chat') : next();
    } catch (error) {
      localStorage.removeItem('token');
      return next('/login');
    }
  }

  return to.name === 'chat' ? next('/login') : next();
});

// 页面加载时检查token有效性
window.addEventListener('load', () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const { exp } = jwtDecode(token);
      if (Date.now() >= exp * 1000) {
        localStorage.removeItem('token');
      }
    } catch {
      localStorage.removeItem('token');
    }
  }
});

export default router;