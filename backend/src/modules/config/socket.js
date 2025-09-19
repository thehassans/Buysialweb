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
      pingTimeout: 30000, // wait longer before considering the connection closed
      pingInterval: 20000, // send pings frequently to keep upstream proxies happy
    });

    this.io.on('connection', (socket) => {
      console.log('A user connected:', socket.id);
      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
      });
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
