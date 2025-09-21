import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

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

    const pingTimeout = Number(process.env.SOCKET_IO_PING_TIMEOUT || 60000);
    const pingInterval = Number(process.env.SOCKET_IO_PING_INTERVAL || 25000);
    const connectTimeout = Number(process.env.SOCKET_IO_CONNECT_TIMEOUT || 20000);
    const maxHttpBufferSize = Number(process.env.SOCKET_IO_MAX_BUFFER || 1e6);
    const upgradeTimeout = Number(process.env.SOCKET_IO_UPGRADE_TIMEOUT || 10000);
    const pathOpt = String(process.env.SOCKET_IO_PATH || '/socket.io');

    this.io = new Server(server, {
      cors: corsOpts,
      path: pathOpt,
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      pingTimeout,
      pingInterval,
      connectTimeout,
      maxHttpBufferSize,
      // Force WebSocket transport when possible
      forceNew: false,
      // Upgrade timeout for WebSocket handshake
      upgradeTimeout,
    });

    // Add connection monitoring
    this.io.on('connection', (socket) => {
      console.log('A user connected:', socket.id, 'Transport:', socket.conn.transport.name);

      // Try to authenticate via JWT and join rooms for targeted events
      try{
        const token = (socket.handshake?.auth && socket.handshake.auth.token) || (socket.handshake?.query && socket.handshake.query.token);
        if (token){
          const SECRET = process.env.JWT_SECRET || 'devsecret-change-me';
          try{
            const payload = jwt.verify(String(token), SECRET);
            const uid = payload?.id ? String(payload.id) : null;
            const role = payload?.role ? String(payload.role) : null;
            if (uid){
              socket.data.user = { id: uid, role };
              try{ socket.join(`user:${uid}`) }catch{}
              if (role) try{ socket.join(`role:${role}`) }catch{}
              console.log(`[socket] ${socket.id} joined rooms:`, [`user:${uid}`, role?`role:${role}`:null].filter(Boolean).join(', '))

              // Also join workspace:<ownerId> so we can broadcast workspace updates
              ;(async()=>{
                try{
                  const { default: User } = await import('../models/User.js')
                  const doc = await User.findById(uid).select('role createdBy').lean()
                  let ownerId = uid
                  if (doc){ ownerId = (doc.role === 'user') ? uid : (doc.createdBy ? String(doc.createdBy) : uid) }
                  try{ socket.join(`workspace:${ownerId}`) }catch{}
                }catch(e){ /* ignore */ }
              })()
            }
          }catch(e){
            console.warn('[socket] JWT verify failed for connection', e?.message || e);
          }
        }
      }catch{}

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
