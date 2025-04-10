<template>
  <div class="login-container">
    <el-card class="login-card">
      <h2 class="login-title">用户登录</h2>
      <el-form :model="form" :rules="rules" ref="loginForm">
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            prefix-icon="User"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            prefix-icon="Lock"
            show-password
          />
        </el-form-item>
        <el-form-item>
            <el-button
              type="primary"
              @click="handleLogin"
              :loading="loading"
              class="login-btn"
            >
              登录
            </el-button>
          
          
            <el-button
              @click="$router.push('/register')"
              class="register-btn"
              :loading="loading"
            >
              注册
            </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { getSocket } from "@/socket/socket";

const socket = getSocket();
const router = useRouter();
const loading = ref(false);
const loginForm = ref(null);

const form = ref({
  username: "",
  password: "",
});

const rules = {
  username: [
    {
      validator: (_, v, cb) =>
        /^[a-zA-Z0-9_]{3,12}$/.test(v)
          ? cb()
          : cb(new Error("用户名格式不正确")),
    },
  ],
  password: [
    {
      validator: (_, v, cb) =>
        /(?=.*\d)(?=.*[A-Z]).{6,18}/.test(v)
          ? cb()
          : cb(new Error("密码需包含大写字母和数字")),
    },
  ],
};

const handleLogin = async () => {
  try {
    await loginForm.value.validate();
    loading.value = true;

    const response = await fetch("http://localhost:3000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form.value),
    });

    const data = await response.json();

    if (response.ok) {
      // 保存令牌到本地存储
      localStorage.setItem("token", data.token);

      // 重置 Socket 实例
      socket.disconnect(); // 断开旧连接
      socket.auth.token = data.token; // 更新 Token
      socket.connect(); // 使用新 Token 连接

      ElMessage.success("登录成功");
      router.push("/chat");
    } else {
      ElMessage.error(data.message);
    }
  } catch (error) {
    ElMessage.error(error.message || "登录失败");
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: #f0f2f5;
}

.login-card {
  width: 400px;
  padding: 20px;
}

.login-title {
  text-align: center;
  margin-bottom: 30px;
}

.login-btn, .register-btn {
  width: 48%;
  margin: 10px 0;
}
</style>
