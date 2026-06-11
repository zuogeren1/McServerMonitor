import { io, type Socket } from 'socket.io-client'

// 模块级 lazily 初始化——模块被 import 时不会立即建连接（兼容测试/SSR 环境）
// getSocket() 在模块级别记录实例，只初始化一次，StrictMode 下也不会重复
let _socket: Socket | null = null
export const getSocket = (): Socket => {
  if (!_socket) {
    _socket = io({
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    })
  }
  return _socket
}

// 通知状态机内部计数器——模块级变量，唯一的存储位置
// useSocket.ts 直接读写这些，不另建 useRef（避免数据分两处存储导致不一致）
export const _offlineCounts: Map<number, number> = new Map()
export const _offlineNotified: Set<number> = new Set()
