import { Server } from 'socket.io';

class SocketManager {
  constructor(){
    this.io = null;
  }

  initSocket(server) {
    // Respect CORS_ORIGIN env for Socket.IO as well
    const raw = (process.env.CORS_ORIGIN || '*')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const useWildcard = raw.includes('*')
    const corsOpts = useWildcard
      ? { origin: '*', methods: ['GET','POST'] }
      : { origin: raw, methods: ['GET','POST'], credentials: true }

    // Environment-driven tuning for lower baseline load
    const wsOnly = String(process.env.SOCKET_WEBSOCKET_ONLY || 'true').toLowerCase() === 'true'
    const transports = wsOnly ? ['websocket'] : ['websocket', 'polling']
    const allowEIO3 = String(process.env.SOCKET_ALLOW_EIO3 || 'false').toLowerCase() === 'true'
    const pingInterval = Number(process.env.SOCKET_PING_INTERVAL_MS || 30000) // default 30s
    const pingTimeout = Number(process.env.SOCKET_PING_TIMEOUT_MS || 70000) // default 70s
    const connectTimeout = Number(process.env.SOCKET_CONNECT_TIMEOUT_MS || 20000) // default 20s
    const maxHttpBufferSize = Number(process.env.SOCKET_MAX_BUFFER_BYTES || 5e5) // default ~500KB
    // Compression trades CPU for bandwidth; default disabled for minimal CPU
    const perMessageDeflate = String(process.env.SOCKET_COMPRESS || 'false').toLowerCase() === 'true'

    this.io = new Server(server, {
      cors: corsOpts,
      path: '/socket.io',
      transports,
      allowEIO3,
      pingTimeout,
      pingInterval,
      connectTimeout,
      maxHttpBufferSize,
      perMessageDeflate,
      // Force WebSocket transport when possible
      forceNew: false,
      // Upgrade timeout for WebSocket handshake
      upgradeTimeout: 10000,
    });

    // Add connection monitoring
    this.io.on('connection', (socket) => {
      console.log('A user connected:', socket.id, 'Transport:', socket.conn.transport.name);

      // Monitor connection health
      socket.on('disconnect', (reason) => {
        console.log('User disconnected:', socket.id, 'Reason:', reason);
      });

      // Handle connection errors
      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', socket.id, error);
      });

      // Monitor transport upgrades
      socket.conn.on('upgrade', () => {
        console.log('Transport upgraded for', socket.id, 'to', socket.conn.transport.name);
      });

      // Monitor transport upgrade errors
      socket.conn.on('upgradeError', (error) => {
        console.error('Transport upgrade error for', socket.id, ':', error);
      });
    });

    // Add engine.io monitoring
    this.io.engine.on('connection_error', (error) => {
      console.error('Engine.IO connection error:', error);
    });
  }

  getIO() {
    if (!this.io) {
      throw new Error('Socket.io not initialized!');
    }
    return this.io;
  }
}

const socketManager = new SocketManager();

export function initSocket(server) {
  socketManager.initSocket(server);
}

export function getIO() {
  return socketManager.getIO();
}
