const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cors = require("cors");

// 配置 bcrypt 盐的轮数
const SALT_ROUNDS = 10;

// 创建 Express 应用
const app = express();
// 创建 HTTP 服务器
const server = createServer(app);

// 解析 JSON 数据
app.use(express.json());

// 配置 CORS 中间件
app.use(
    cors({
        origin: "http://localhost:5173", // 前端地址
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    })
);

// 创建 Socket.IO 服务器
const io = new Server(server, {
    cors: {
        origin: "*", // 生产环境应限制为具体域名
    },
    // 关键配置：处理大文件
    maxHttpBufferSize: 10 * 1024 * 1024, // 10MB缓冲区（根据需求调整）
    pingTimeout: 60000, // 60秒超时（默认20秒）
    pingInterval: 25000, // 心跳间隔（默认25秒）
});

// 存储在线用户
const onlineUsers = new Map();
// 存储注册用户
const registeredUsers = new Map();
// 临时存储私聊记录
const privateMessages = new Map();

// 存储私聊消息
async function storePrivateMessage(senderUsername, receiverUsername, message) {
    const key = [senderUsername, receiverUsername].sort().join("_");
    if (!privateMessages.has(key)) {
        privateMessages.set(key, []);
    }
    privateMessages.get(key).push(message);
}

// 获取私聊历史记录
async function getPrivateHistory(user1, user2) {
    const key = [user1, user2].sort().join("_");
    return privateMessages.get(key) || [];
}

// 验证用户名格式
function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,12}$/.test(username);
}

// 验证密码格式
function isValidPassword(password) {
    return /(?=.*\d)(?=.*[A-Z]).{6,18}/.test(password);
}

// 注册接口
app.post("/api/register", async (req, res) => {
    try {
        const { username, password } = req.body;

        // 输入验证
        if (!isValidUsername(username)) {
            return res
              .status(400)
              .json({ message: "用户名只能包含字母、数字和下划线（3-12位）" });
        }
        if (!isValidPassword(password)) {
            return res
              .status(400)
              .json({ message: "密码需包含至少一个大写字母和数字（6-18位）" });
        }

        if (registeredUsers.has(username)) {
            return res.status(400).json({ message: "用户名已存在" });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        registeredUsers.set(username, hashedPassword);
        res.status(200).json({ message: "注册成功" });
    } catch (error) {
        res.status(500).json({ message: "服务器错误" });
    }
});

// 添加 Socket.IO 认证中间件
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

        // 生成 JWT
        const token = jwt.sign({ username }, "your_secret_key", {
            expiresIn: "1h",
        });
        res.status(200).json({ message: "登录成功", token });
    } catch (error) {
        res.status(500).json({ message: "服务器错误" });
    }
});

// 验证用户名是否存在接口
app.get("/api/validate", (req, res) => {
    const user = req.query.user;
    if (!registeredUsers.has(user)) {
        return res.status(404).json({ valid: false });
    }
    res.status(200).json({ valid: true });
});

// 更新用户列表
function updateUserList() {
    io.emit("user list", Array.from(onlineUsers.values()));
}

// 用户连接处理
io.on("connection", (socket) => {
    const username = socket.decoded.username;

    // 关闭该用户旧连接
    const existingUser = onlineUsers.get(username);
    if (existingUser) {
        const oldSocket = io.sockets.sockets.get(existingUser.id);
        oldSocket?.disconnect(true); // 强制断开旧连接
    }

    // 存储新连接
    onlineUsers.set(username, {
        id: socket.id,
        username,
        tabs: new Set([socket.id]), // 记录标签页ID
    });

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
        const user = onlineUsers.get(username);
        if (!user) return; // 用户未注册或未认证

        // 统一消息结构
        const messageObj = {
            username: user.username,
            timestamp: new Date().toISOString(),
            senderId: socket.id,
            ...(typeof msg === "string"
              ? { type: "text", content: msg }
              : msg),
        };

        // 验证消息类型
        if (!["text", "image"].includes(messageObj.type)) {
            console.warn("无效消息类型:", messageObj.type);
            return;
        }

        // 广播消息给所有客户端
        io.emit("chat message", messageObj);
    });

    // 处理断开连接事件
    socket.on("disconnect", (reason) => {
        console.log(`用户断开: ${username} 原因: ${reason}`);
        // 延迟删除确保重连时能正确处理
        setTimeout(() => {
            if (onlineUsers.has(username) && onlineUsers.get(username).id === socket.id) {
                onlineUsers.delete(username);
                socket.broadcast.emit("user left", username);
                updateUserList();
            }
        }, 5000); // 5秒延迟处理断开
    });

    // 处理重连事件
    socket.on("reconnect", (attempt) => {
        console.log(`用户重连: ${username} 尝试次数: ${attempt}`);
        onlineUsers.set(username, { id: socket.id, username });
        updateUserList();
    });

    // 处理标签页同步事件
    socket.on("tab-sync", (tabId) => {
        const user = onlineUsers.get(username);
        if (user) {
            user.tabs.add(tabId);
        }
    });

    // 处理私聊消息事件
    socket.on("private message", (msg) => {
        const sender = onlineUsers.get(username);

        // 禁止自己给自己发私聊
        if (msg.receiverUsername === sender.username) {
            return socket.emit("error", "不能给自己发送私聊消息");
        }

        const receiver = onlineUsers.get(msg.receiverUsername);

        if (!receiver) {
            return socket.emit("error", "用户不在线");
        }

        const messageObj = {
            ...msg,
            senderId: socket.id,
            senderUsername: sender.username,
            receiverUsername: receiver.username,
            timestamp: new Date().toISOString(),
            isPrivate: true,
        };

        // 存储消息
        storePrivateMessage(sender.username, receiver.username, messageObj);

        // 发送给发送者和接收者的所有标签页
        sender.tabs.forEach((tab) => {
            io.to(tab).emit("private message", messageObj);
        });
        receiver.tabs.forEach((tab) => {
            io.to(tab).emit("private message", messageObj);
        });
    });

    // 处理加载私聊历史记录事件
    socket.on("load_private_history", async ({ targetUsername }) => {
        const history = await getPrivateHistory(username, targetUsername);
        socket.emit("private_history", history);
    });
});

// 启动服务器
server.listen(3000, () => {
    console.log("server running at http://localhost:3000");
});
    