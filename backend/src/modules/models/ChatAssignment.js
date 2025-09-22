import mongoose from 'mongoose'

const ChatAssignmentSchema = new mongoose.Schema({
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  chatId: { type: String, index: true },
  firstMessageAt: { type: Date },
  firstResponseAt: { type: Date },
}, { timestamps: true })

export default mongoose.model('ChatAssignment', ChatAssignmentSchema)
