import mongoose from 'mongoose'

const ChatAssignmentSchema = new mongoose.Schema({
  // Unique chat identifier (WhatsApp JID)
  jid: { type: String, index: true, required: true },
  // Optional assignee (Agent). Indexed for quick queries by owner.
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  // Timestamps to measure SLA metrics
  firstMessageAt: { type: Date },
  firstResponseAt: { type: Date },
}, { timestamps: true })

// Ensure fast lookups by jid
ChatAssignmentSchema.index({ jid: 1 })

export default mongoose.models.ChatAssignment || mongoose.model('ChatAssignment', ChatAssignmentSchema)
