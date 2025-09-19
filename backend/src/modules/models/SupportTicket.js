import mongoose from 'mongoose'

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['admin','user','agent'], required: true },
  body: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false })

const SupportTicketSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  status: { type: String, enum: ['open','pending','closed'], default: 'open', index: true },
  tags: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByRole: { type: String, enum: ['admin','user','agent'], required: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  messages: [MessageSchema],
}, { timestamps: true })

export default mongoose.model('SupportTicket', SupportTicketSchema)
