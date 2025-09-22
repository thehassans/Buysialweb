import mongoose from 'mongoose';
// NOTE: Avoid top-level import of 'mongodb-memory-server'.
// We'll dynamically import it inside connectDB to prevent startup crashes
// when the package initialization blocks (e.g., downloading binaries).

function maskUri(uri=''){
  try{
    if (!uri) return ''
    // hide credentials between '//' and '@'
    return uri.replace(/\/\/(.*?):(.*?)@/, '//***:***@')
  }catch{ return uri }
}

export async function connectDB() {
  const preferMemory = process.env.USE_MEMORY_DB === 'true';
  const haveUri = !!process.env.MONGO_URI;
  let useMemory = preferMemory || !haveUri;
  mongoose.set('strictQuery', true);
  // Helpful runtime listeners
  mongoose.connection.on('connected', ()=> console.log('[mongo] connected', { db: mongoose.connection.name }))
  mongoose.connection.on('disconnected', ()=> console.warn('[mongo] disconnected'))
  mongoose.connection.on('reconnected', ()=> console.log('[mongo] reconnected'))
  mongoose.connection.on('error', (err)=> console.error('[mongo] error:', err?.message || err))

  if (useMemory) {
    console.warn('[mongo] Using in-memory MongoDB (USE_MEMORY_DB=true or MONGO_URI missing). Data will NOT persist.')
    try{
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const memUri = mongod.getUri();
      await mongoose.connect(memUri);
      console.log('MongoDB connected (in-memory)');
      return
    }catch(err){
      console.error('[mongo] In-memory MongoDB failed to start:', err?.message || err)
      if (haveUri){
        console.warn('[mongo] Falling back to MONGO_URI connection since in-memory DB failed.')
        useMemory = false;
      } else {
        throw err;
      }
    }
  }

  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME || undefined; // optional explicit DB
  const opts = {
    dbName,
    // timeouts and modern topology options
    // Give Atlas more time to elect/select a primary on first connect
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    family: 4,
  }
  console.log('[mongo] connecting...', { uri: maskUri(uri), dbName: dbName || '(from URI)' })
  try{
    await mongoose.connect(uri, opts)
    const con = mongoose.connection
    const host = con.host || (con.client && con.client.s.options && con.client.s.options.srvHost) || 'unknown-host'
    console.log('MongoDB connected:', { host, db: con.name })
  }catch(err){
    console.error('[mongo] failed to connect:', err?.message || err)
    console.error('[mongo] Hints: ensure MONGO_URI is correct, server IP is whitelisted in Atlas, and network allows egress to MongoDB.')
    throw err
  }
}
