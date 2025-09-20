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

    this.io = new Server(server, {
      cors: corsOpts,
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      pingTimeout: 60000, // Increased to 60s for unstable connections
      pingInterval: 25000, // Increased to 25s for less frequent pings
      connectTimeout: 20000, // 20s to establish connection
      maxHttpBufferSize: 1e6, // 1MB buffer for large messages
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
