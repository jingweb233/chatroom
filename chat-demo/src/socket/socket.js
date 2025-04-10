// 修改 socket 实例创建方式
import { io } from "socket.io-client";

let socketInstance = null;

export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io("http://localhost:3000", {
      autoConnect: false,
      auth: {
        token: localStorage.getItem("token"),
      },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
    });
  }
  return socketInstance;
};