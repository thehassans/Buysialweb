#!/usr/bin/env node
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../src/modules/config/db.js'
import ChatAssignment from '../src/modules/models/ChatAssignment.js'

async function main(){
  dotenv.config()
  await connectDB()
  const col = ChatAssignment.collection
  if (!col){
    console.error('[migrate] ChatAssignment collection not found')
    process.exit(2)
  }
  const filter = { $and: [ { $or: [ { jid: { $exists: false } }, { jid: null }, { jid: '' } ] }, { chatId: { $type: 'string' } }, { chatId: { $ne: '' } } ] }
  try{
    const before = await col.countDocuments(filter)
    if (before === 0){
      console.log('[migrate] No documents require migration')
    } else {
      // Use aggregation pipeline update to copy chatId -> jid and unset chatId
      const res = await col.updateMany(filter, [ { $set: { jid: '$chatId' } }, { $unset: 'chatId' } ])
      console.log('[migrate] Updated documents:', res?.modifiedCount ?? 0)
    }
  }catch(err){
    console.error('[migrate] Migration failed:', err?.message || err)
    process.exit(1)
  } finally {
    try{ await mongoose.connection.close() }catch{}
  }
}

main().catch((e)=>{ console.error('[migrate] Fatal:', e?.message||e); process.exit(1) })
