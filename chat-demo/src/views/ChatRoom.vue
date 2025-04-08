<template>
  <div class="chat-container">
    <!-- 侧边栏用户列表 -->
    <el-card class="user-list-card">
      <template #header>
        <div class="card-header">
          <span>在线用户 ({{ onlineUsers.length }})</span>
          <el-button @click="logout">退出</el-button>
        </div>
      </template>
      <el-scrollbar height="calc(100vh - 180px)">
        <div v-for="user in onlineUsers" :key="user.id" class="user-item">
          <el-icon>
            <User />
          </el-icon>
          <span class="username">{{ user.username }}</span>
        </div>
      </el-scrollbar>
    </el-card>

    <!-- 主聊天区域 -->
    <div class="main-chat">
      <!-- 消息展示区域 -->
      <div class="message-box">
        <el-scrollbar ref="messagesScroll" height="calc(100vh - 160px)">
          <div
            v-for="(msg, index) in messages"
            :key="index"
            class="message-item"
            :class="{ 'system-msg': msg.type === 'system' }"
          >
            <!-- 系统消息样式 -->
            <template v-if="msg.type === 'system'">
              <div class="system-card">
                <el-text class="mx-1" type="info" size="small" tag="div">
                  {{ msg.content }}
                </el-text>
              </div>
            </template>

            <!-- 用户消息样式 -->
            <template v-else>
              <bubble
                :content="msg.content"
                class="user-card"
                :placement="msg.isMe ? 'end' : 'start'"
              >
                <template #avatar>
                  <el-avatar :src="avatarAI" />
                </template>
                <template #header>
                  <span>{{ msg.username }}</span>
                </template>
                <template #content>
                  <div>
                    <span v-if="msg.type === 'text'">{{ msg.content }}</span>
                    <el-image
                      v-else-if="msg.type === 'image'"
                      :src="msg.content"
                      :preview-src-list="[msg.content]"
                      :initial-index="0"
                      :hide-on-click-modal="true"
                      class="chat-image"
                      fit="cover"
                    >
                      <template #error>
                        <div class="image-error">
                          <el-icon><PictureFilled /></el-icon>
                          <span>图片加载失败</span>
                        </div>
                      </template>
                    </el-image>
                  </div>
                </template>
                <template #footer>
                  <span>{{ formatTime(msg.timestamp) }}</span>
                </template>
              </bubble>
            </template>
          </div>
        </el-scrollbar>
      </div>

      <!-- 消息输入区域 -->
      <div class="input-area">
        <el-input
          v-model="newMessage"
          type="textarea"
          :rows="4"
          placeholder="输入消息..."
          resize="none"
          style="width: 1000px; height: 80%; outline: none"
          clearable
          @keyup.enter="sendMessage"
        >
        </el-input>
        <div class="action-bar">
          <el-upload
            class="chat-upload"
            action="#"
            :auto-upload="false"
            :show-file-list="false"
            :on-change="handleFileSelect"
            :before-upload="validateFile"
          >
            <template #trigger>
              <el-tooltip content="上传照片" placement="top">
                <el-icon :size="28">
                  <PictureFilled />
                </el-icon>
              </el-tooltip>
            </template>
          </el-upload>
          <el-tooltip content="发送" placement="top">
            <el-button
              type="primary"
              @click="sendMessage"
              :icon="Promotion"
              class="send-button"
            ></el-button>
          </el-tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { User, Promotion, PictureFilled } from "@element-plus/icons-vue";
import { getSocket } from "@/socket/socket";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";

// IndexedDB 操作封装
const DB_NAME = "ChatDB";
const STORE_NAME = "Messages";
const VERSION = 1;

let db = null;

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
  });
};

const saveMessage = (msg) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(msg);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const loadMessages = () => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const router = useRouter();
const socket = getSocket();
const avatarAI = "https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png";
const messages = ref([]);
const onlineUsers = ref([]);
const newMessage = ref("");
const messagesScroll = ref(null);
const currentUserId = ref(null);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const formatTime = (date) => {
  return new Date(date).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("currentTab");
  localStorage.setItem("force-logout", Date.now());
  setTimeout(() => localStorage.removeItem("force-logout"), 100);
  socket.disconnect();
  router.push("/login");
};

const sendMessage = () => {
  if (newMessage.value.trim()) {
    const msg = {
      type: "text",
      content: newMessage.value.trim(),
    };
    socket.emit("chat message", msg);
    newMessage.value = "";
  }
};

const handleFileSelect = (file) => {
  if (file.raw.size > MAX_FILE_SIZE) {
    ElMessage.error("图片大小不能超过10MB，请压缩后重新上传");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const msg = {
      type: "image",
      content: e.target.result,
      filename: file.name,
    };
    socket.emit("chat message", msg);
  };
  reader.readAsDataURL(file.raw);
};

const validateFile = (file) => {
  if (file.size > MAX_FILE_SIZE) {
    ElMessage.error("图片大小不能超过10MB");
    return false;
  }
  return true;
};

const scrollToBottom = () => {
  nextTick(() => {
    const container = messagesScroll.value?.wrapRef;
    if (container) {
      const lastMsg = container.querySelector(".message-item:last-child");
      if (lastMsg) {
        lastMsg.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }
  });
};

onMounted(async () => {
  await openDB();
  
  // 加载本地存储的消息
  const storedMessages = await loadMessages();
  messages.value = storedMessages.length
    ? storedMessages
    : [{ type: "system", content: "欢迎进入聊天室", timestamp: new Date() }];

  const tabId = crypto.randomUUID();
  localStorage.setItem("currentTab", tabId);
  socket.emit("tab-sync", tabId);

  socket.on("reconnect", (attempt) => {
    console.log(`成功重连，尝试次数: ${attempt}`);
    socket.emit("request_userlist");
  });

  socket.on("reconnect_error", (error) => {
    console.log("重连失败:", error);
  });

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      socket.connect();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  window.addEventListener("storage", (event) => {
    if (event.key === "token" && !event.newValue) {
      logout();
    }
    if (event.key === "force-logout") {
      router.push("/login");
      socket.disconnect();
    }
  });

  if (!localStorage.getItem("token")) {
    router.push("/");
  }

  socket.on("connect", () => {
    socket.emit("request_userlist");
  });

  socket.on("connect_error", (err) => {
    if (err.message === "未授权" || err.message === "认证失败") {
      ElMessage.error("登录已过期，请重新登录");
      localStorage.removeItem("token");
      router.push("/");
    }
  });

  socket.on("verify-socket-id", (socketId) => {
    currentUserId.value = socketId;
  });

  socket.on("chat message", async (msg) => {
    const messageWithSelf = { ...msg, isMe: msg.senderId === currentUserId.value };
    messages.value.push(messageWithSelf);
    await saveMessage(messageWithSelf);
    scrollToBottom();
  });

  socket.emit("request_userlist");

  socket.on("user list", (users) => {
    onlineUsers.value = users;
  });

  socket.on("user joined", async (username) => {
    const msg = {
      type: "system",
      content: `${username} 加入了聊天室`,
      timestamp: new Date(),
    };
    messages.value.push(msg);
    await saveMessage(msg);
    scrollToBottom();
  });

  socket.on("user left", async (username) => {
    const msg = {
      type: "system",
      content: `${username} 离开了聊天室`,
      timestamp: new Date(),
    };
    messages.value.push(msg);
    await saveMessage(msg);
    scrollToBottom();
  });

  scrollToBottom();
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<style scoped>
.chat-container {
  display: flex;
  height: 100vh;
  background-color: #f5f7fa;
}

.user-list-card {
  width: 260px;
  margin: 10px;
  border-radius: 8px;
}

.main-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin: 10px;
}

.message-box {
  flex: 1;
  margin-bottom: 0px;
  border-radius: 8px;
}

.user-item {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  transition: background 0.3s;
}

.user-item:hover {
  background-color: #f5f7fa;
}

.username {
  margin-left: 8px;
}

.message-item {
  margin: 8px 0;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.system-card {
  border-color: #e1f3d8;
  display: flex;
  justify-content: center;
  opacity: 0.8;
}

.system-card :deep(.el-card__header) {
  padding: 0 12px;
  border: none;
}

.user-card {
  margin-left: 40px;
  margin-right: 40px;
}

.input-area {
  position: relative;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  padding: 12px;
  margin: 16px auto;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1000px;
}

.el-input {
  flex-grow: 1;
  height: 80%;
  border: none;
  border-radius: 8px;
  resize: none;
  overflow: hidden;
  box-sizing: border-box;
  margin-bottom: 12px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.send-button {
  position: static;
  padding: 8px 16px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.send-button:hover {
  background-color: #409eff;
  color: white;
}

.chat-image {
  max-width: 300px;
  max-height: 300px;
}
</style>
