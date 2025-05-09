<template>
  <div class="chat-container">
      <!-- 私聊对话框 -->
      <el-dialog
          v-model="privateChatVisible"
          :title="`${currentPrivateUser?.username} `"
          width="80%"
          top="5vh"
          destroy-on-close
          @opened="scrollPrivateToBottom"
      >
          <div class="private-chat-container">
              <!-- 消息显示区域 -->
              <div class="message-box">
                  <el-scrollbar height="60vh" ref="privateMessagesScroll">
                      <div
                          v-for="(msg, index) in privateMessages"
                          :key="'private' + index"
                          class="message-item"
                      >
                          <bubble
                              :content="msg.content"
                              :placement="msg.isMe ? 'end' : 'start'"
                              :class="{
                                  'private-bubble': msg.isPrivate,
                                  'private-bubble-me': msg.isPrivate && msg.isMe,
                                  'private-bubble-other': msg.isPrivate && !msg.isMe,
                              }"
                          >
                              <template #avatar>
                                  <el-avatar :src="avatarAI" />
                              </template>
                              <template #header>
                                  <span v-if="msg.isPrivate">{{ msg.senderUsername }}</span>
                                  <span v-else>{{ msg.username }}</span>
                              </template>
                              <template #content>
                                  <span v-if="msg.type === 'text'">{{ msg.content }}</span>
                                  <el-image
                                      v-else-if="msg.type === 'image'"
                                      :src="msg.content"
                                      :preview-src-list="[msg.content]"
                                  />
                              </template>
                              <template #footer>
                                  <span>{{ formatTime(msg.timestamp) }}</span>
                              </template>
                          </bubble>
                      </div>
                  </el-scrollbar>
              </div>
              <!-- 输入区域 -->
              <div class="input-area private-input">
                  <el-input
                      v-model="newPrivateMessage"
                      type="textarea"
                      :rows="3"
                      resize="none"
                      placeholder="输入私信..."
                      @keyup.enter="sendPrivateMessage"
                  />
                  <div class="action-bar">
                      <el-upload
                          class="chat-upload"
                          action="#"
                          :auto-upload="false"
                          :show-file-list="false"
                          :on-change="handlePrivateFileSelect"
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
                      <el-button
                          type="primary"
                          @click="sendPrivateMessage"
                          :icon="Promotion"
                      >发送</el-button>
                  </div>
              </div>
          </div>
      </el-dialog>
      <!-- 在线用户列表 -->
      <el-card class="user-list-card">
          <template #header>
              <div class="card-header">
                  <span>在线用户 ({{ onlineUsers.length }})</span>
                  <el-button @click="logout">退出</el-button>
              </div>
          </template>
          <el-scrollbar height="calc(100vh - 180px)">
              <div
                  v-for="user in onlineUsers"
                  :key="user.id"
                  class="user-item"
                  @click="
                      user.username !== currentUser?.username && openPrivateChat(user)
                  "
                  :class="{ 'self-user': user.username === currentUser?.username }"
              >
                  <el-icon>
                      <User />
                  </el-icon>
                  <span class="username">{{ user.username }}</span>
                  <span v-if="user.username === currentUser?.username" class="self-tag">(我)</span>
              </div>
          </el-scrollbar>
      </el-card>
      <!-- 主聊天区域 -->
      <div class="main-chat">
          <!-- 消息显示区域 -->
          <div class="message-box">
              <el-scrollbar ref="messagesScroll" height="calc(100vh - 160px)">
                  <div
                      v-for="(msg, index) in messages"
                      :key="index"
                      class="message-item"
                      :class="{ 'system-msg': msg.type === 'system' }"
                  >
                      <!-- 系统消息 -->
                      <template v-if="msg.type === 'system'">
                          <div class="system-card">
                              <el-text class="mx-1" type="info" size="small" tag="div">
                                  {{ msg.content }}
                              </el-text>
                          </div>
                      </template>
                      <!-- 用户消息 -->
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
                                                  <el-icon>
                                                      <PictureFilled />
                                                  </el-icon>
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
          <!-- 输入区域 -->
          <div class="input-area">
              <el-input
                  v-model="newMessage"
                  type="textarea"
                  :rows="4"
                  placeholder="输入消息..."
                  resize="none"
                  clearable
                  @keyup.enter="sendMessage"
              />
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
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { User, Promotion, PictureFilled } from '@element-plus/icons-vue';
import { getSocket } from '@/socket/socket';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { jwtDecode } from 'jwt-decode';

const router = useRouter();
const socket = getSocket();
const avatarAI = 'https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png';
const messages = ref([]);
const onlineUsers = ref([]);
const newMessage = ref('');
const messagesScroll = ref(null);
const currentUserId = ref(null);
const currentUser = ref(null);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
  });
};

const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('currentTab');
  localStorage.setItem('force-logout', Date.now());
  setTimeout(() => localStorage.removeItem('force-logout'), 100);
  socket.disconnect();
  router.push('/login');
};

const sendMessage = () => {
  if (newMessage.value.trim()) {
      const msg = {
          type: 'text',
          content: newMessage.value.trim(),
      };
      socket.emit('chat message', msg);
      newMessage.value = '';
      scrollToBottom();
  }
};

const handleFileSelect = (file) => {
  if (file.raw.size > MAX_FILE_SIZE) {
      ElMessage.error('图片大小不能超过10MB，请压缩后重新上传');
      return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
      const msg = {
          type: 'image',
          content: e.target.result,
          filename: file.name,
      };
      socket.emit('chat message', msg);
      scrollToBottom();
  };
  reader.readAsDataURL(file.raw);
};

const validateFile = (file) => {
  if (file.size > MAX_FILE_SIZE) {
      ElMessage.error('图片大小不能超过10MB');
      return false;
  }
  return true;
};

const scrollToBottom = () => {
  nextTick(() => {
      const container = messagesScroll.value?.wrapRef;
      if (container) {
          container.scrollTop = container.scrollHeight;
      }
  });
};

const privateChatVisible = ref(false);
const currentPrivateUser = ref(null);
const newPrivateMessage = ref('');
const privateMessages = ref([]);
const privateMessagesScroll = ref(null);

const scrollPrivateToBottom = () => {
  nextTick(() => {
      const container = privateMessagesScroll.value?.wrapRef;
      if (container) {
          container.scrollTop = container.scrollHeight;
      }
  });
};

const openPrivateChat = (user) => {
  if (!user) return;
  currentPrivateUser.value = user;
  privateChatVisible.value = true;
  privateMessages.value = [];
  socket.emit('load_private_history', {
      targetUsername: user.username,
  });
};

const sendPrivateMessage = () => {
  if (
      !currentPrivateUser.value ||
      currentPrivateUser.value.username === currentUser.value?.username
  ) {
      ElMessage.warning('不能给自己发送私聊消息');
      return;
  }
  if (newPrivateMessage.value.trim()) {
      const msg = {
          type: 'text',
          content: newPrivateMessage.value.trim(),
          receiverUsername: currentPrivateUser.value.username,
      };
      socket.emit('private message', msg);
      newPrivateMessage.value = '';
      scrollPrivateToBottom();
  }
};

const handlePrivateFileSelect = (file) => {
  if (file.raw.size > MAX_FILE_SIZE) {
      ElMessage.error('图片大小不能超过10MB，请压缩后重新上传');
      return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
      const msg = {
          type: 'image',
          content: e.target.result,
          filename: file.name,
          receiverUsername: currentPrivateUser.value.username,
      };
      socket.emit('private message', msg);
      scrollPrivateToBottom();
  };
  reader.readAsDataURL(file.raw);
};

const updateCurrentUser = () => {
  const token = localStorage.getItem('token');
  if (token) {
      try {
          const decoded = jwtDecode(token);
          currentUser.value = { username: decoded.username };
      } catch (e) {
          console.error('Token 解析失败:', e);
          logout();
      }
  } else {
      logout();
  }
};

onMounted(() => {
  const tabId = crypto.randomUUID();
  localStorage.setItem('currentTab', tabId);
  socket.emit('tab-sync', tabId);

  socket.on('connect', () => {
      socket.emit('request_userlist');
      updateCurrentUser();
  });

  socket.on('connect_error', (err) => {
      if (err.message === '未授权' || err.message === '认证失败') {
          ElMessage.error('登录已过期，请重新登录');
          logout();
      }
  });

  socket.on('verify-socket-id', (socketId) => {
      currentUserId.value = socketId;
  });

  socket.on('chat message', (msg) => {
      const messageWithSelf = {
          ...msg,
          isMe: msg.senderId === currentUserId.value,
      };
      messages.value.push(messageWithSelf);
      scrollToBottom();
  });

  socket.on('user list', (users) => {
      onlineUsers.value = users;
      updateCurrentUser();
  });

  socket.on('user joined', (username) => {
      const msg = {
          type: 'system',
          content: `${username} 加入了聊天室`,
          timestamp: new Date(),
      };
      messages.value.push(msg);
      scrollToBottom();
  });

  socket.on('user left', (username) => {
      const msg = {
          type: 'system',
          content: `${username} 离开了聊天室`,
          timestamp: new Date(),
      };
      messages.value.push(msg);
      scrollToBottom();
  });

  socket.on('private message', (msg) => {
      const messageWithSelf = {
          ...msg,
          isMe: msg.senderId === currentUserId.value,
      };
      if (
          privateChatVisible.value &&
          (msg.senderUsername === currentPrivateUser.value.username ||
              msg.receiverUsername === currentPrivateUser.value.username)
      ) {
          privateMessages.value.push(messageWithSelf);
          scrollPrivateToBottom();
      }
  });

  socket.on('private_history', (history) => {
      privateMessages.value = history.map((msg) => ({
          ...msg,
          isMe: msg.senderId === currentUserId.value,
      }));
      scrollPrivateToBottom();
  });

  socket.emit('request_userlist');
});

onUnmounted(() => {
  socket.off('connect');
  socket.off('connect_error');
  socket.off('verify-socket-id');
  socket.off('chat message');
  socket.off('user list');
  socket.off('user joined');
  socket.off('user left');
  socket.off('private message');
  socket.off('private_history');
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

.private-chat-container {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 8px;
}

.private-input {
  margin-top: 15px;
  padding: 10px;
  background: white;
}

.user-item {
  cursor: pointer;
  /* 添加手型指针 */
  transition: background 0.3s;
}

.user-item:hover {
  background-color: #f0f2f5;
}

.self-user {
  cursor: default !important;
  background-color: #f0f5ff !important;
}

.self-tag {
  margin-left: 5px;
  color: #888;
  font-size: 0.8em;
}

.user-item:hover:not(.self-user) {
  background-color: #f5f7fa;
}
</style>
