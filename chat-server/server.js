// server/index.js
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*" // 生产环境应限制为具体域名
  }
});

const users = new Map(); // 存储在线用户

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  // 更新用户列表
  const updateUserList = () => {
    io.emit('user list', Array.from(users.values()));
  };

  // 用户登录
  socket.on('login', (username) => {
    users.set(socket.id, { username, id: socket.id });
    socket.broadcast.emit('user joined', username);
    updateUserList(); // 每次登录更新列表
  });

  // 接收消息
  socket.on('chat message', (msg) => {
    const username = users.get(socket.id);
    io.emit('chat message', {
      username,
      content: msg,
      timestamp: new Date().toISOString()
    });
  });

  // 用户断开连接
  socket.on('disconnect', () => {
    const usernames = users.get(socket.id);
    if (usernames) {
      socket.broadcast.emit('user left', usernames.username);
      users.delete(socket.id);
      updateUserList(); // 每次断开更新列表
    }
  });
});

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});