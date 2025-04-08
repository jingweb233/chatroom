const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const app = express();
const server = createServer(app);
const cors = require("cors");

// 添加bcrypt依赖
const bcrypt = require("bcrypt");
const saltRounds = 10;

// 解析 JSON 数据
app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:5173", // 前端地址
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

const io = new Server(server, {
  cors: {
    origin: "*", // 生产环境应限制为具体域名
  },
  // 关键配置：处理大文件
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB缓冲区（根据需求调整）
  pingTimeout: 60000, // 60秒超时（默认20秒）
  pingInterval: 25000, // 心跳间隔（默认25秒）
});

const users = new Map(); // 存储在线用户
const registeredUsers = new Map(); // 存储注册用户

// 注册接口
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    // 输入验证
    if (!/^[a-zA-Z0-9_]{3,12}$/.test(username)) {
      return res
        .status(400)
        .json({ message: "用户名只能包含字母、数字和下划线（3-12位）" });
    }
    if (!/(?=.*\d)(?=.*[A-Z]).{6,18}/.test(password)) {
      return res
        .status(400)
        .json({ message: "密码需包含至少一个大写字母和数字（6-18位）" });
    }

    if (registeredUsers.has(username)) {
      return res.status(400).json({ message: "用户名已存在" });
    }
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    registeredUsers.set(username, hashedPassword);
    res.status(200).json({ message: "注册成功" });
  } catch (error) {
    res.status(500).json({ message: "服务器错误" });
  }
});

// 添加Socket.IO认证中间件
io.use((socket, next) => {
  const token = socket.handshake.auth.token; // 从 auth 参数获取 token
  if (!token) {
    return next(new Error("未授权"));
  }
  jwt.verify(token, "your_secret_key", (err, decoded) => {
    if (err) return next(new Error("认证失败"));
    socket.decoded = decoded;
    next();
  });
});

// 登录接口
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // 验证用户是否存在
    if (!registeredUsers.has(username)) {
      return res.status(401).json({ message: "用户名或密码错误" });
    }

    // 获取存储的哈希密码
    const hashedPassword = registeredUsers.get(username);

    // 对比密码
    const isMatch = await bcrypt.compare(password, hashedPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "用户名或密码错误" });
    }

    // 生成JWT
    const token = jwt.sign({ username }, "your_secret_key", {
      expiresIn: "1h",
    });
    res.status(200).json({ message: "登录成功", token });
  } catch (error) {
    res.status(500).json({ message: "服务器错误" });
  }
});

app.get("/api/validate", (req, res) => {
  const user = req.query.user;
  if (!registeredUsers.has(user)) {
    return res.status(404).json({ valid: false });
  }
  res.status(200).json({ valid: true });
});

// 用户连接处理
io.on("connection", (socket) => {
  const username = socket.decoded.username;

  // 关闭该用户旧连接
  const existingUser = users.get(username);
  if (existingUser) {
    const oldSocket = io.sockets.sockets.get(existingUser.id);
    oldSocket?.disconnect(true); // 强制断开旧连接
  }

  // 存储新连接
  users.set(username, {
    id: socket.id,
    username,
    tabs: new Set([socket.id]), // 记录标签页ID
  });

  // 更新用户列表
  const updateUserList = () => {
    io.emit("user list", Array.from(users.values()));
  };

  // 广播用户加入
  socket.broadcast.emit("user joined", username);
  updateUserList();

  // 处理用户列表请求
  socket.on("request_userlist", () => {
    updateUserList();
    socket.emit("verify-socket-id", socket.id);
  });

  // 接收消息
  socket.on("chat message", (msg) => {
    // 获取当前用户（键是 username，不是 socket.id）
    const user = users.get(socket.decoded.username);
    if (!user) return; // 用户未注册或未认证

    // 统一消息结构（确保包含必要字段）
    const messageObj = {
      username: user.username, // 正确获取用户名
      timestamp: new Date().toISOString(),
      senderId: socket.id, // 发送者的 socket.id
      ...(typeof msg === "string"
        ? { type: "text", content: msg } // 处理纯文本消息
        : msg // 处理图片等对象消息
      ),
    };

    // 验证消息类型（确保是 text 或 image）
    if (!["text", "image"].includes(messageObj.type)) {
      console.warn("无效消息类型:", messageObj.type);
      return;
    }

    // 广播消息给所有客户端（包括发送者自己）
    io.emit("chat message", messageObj);
  });

  // 修改 disconnect 事件处理
  socket.on("disconnect", (reason) => {
    console.log(`用户断开: ${username} 原因: ${reason}`);
    // 延迟删除确保重连时能正确处理
    setTimeout(() => {
      if (users.has(username) && users.get(username).id === socket.id) {
        users.delete(username);
        socket.broadcast.emit("user left", username);
        updateUserList();
      }
    }, 5000); // 5秒延迟处理断开
  });

  // 添加重连处理逻辑
  socket.on("reconnect", (attempt) => {
    console.log(`用户重连: ${username} 尝试次数: ${attempt}`);
    users.set(username, { id: socket.id, username });
    updateUserList();
  });

  // 新增标签页同步逻辑
  socket.on("tab-sync", (tabId) => {
    const user = users.get(socket.decoded.username);
    if (user) {
      user.tabs.add(tabId);
    }
  });
});

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});
