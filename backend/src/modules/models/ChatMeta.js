import mongoose from 'mongoose'

const NoteSchema = new mongoose.Schema({
  text: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { _id: false })

const ChatMetaSchema = new mongoose.Schema({
  jid: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: '' },
  lastMessageAt: { type: Date },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notes: { type: [NoteSchema], default: [] },
}, { timestamps: true })

export default mongoose.model('ChatMeta', ChatMetaSchema)
