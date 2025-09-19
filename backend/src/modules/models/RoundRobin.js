import mongoose from 'mongoose'

const RoundRobinSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  lastIndex: { type: Number, default: -1 },
}, { timestamps: true })

export default mongoose.model('RoundRobin', RoundRobinSchema)
