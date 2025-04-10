
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as Icons from '@element-plus/icons-vue'
import ElementPlusX from 'vue-element-plus-x'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.use(ElementPlusX)

// 全局注册所有图标
for (const key in Icons) {
    app.component(key, Icons[key])
  }

app.mount('#app')

