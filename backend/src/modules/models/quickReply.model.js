import mongoose from 'mongoose';

const quickReplySchema = new mongoose.Schema({
  shortcut: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

// Add an index to allow agents to quickly find their own replies
quickReplySchema.index({ agent: 1, shortcut: 1 }, { unique: true });

const QuickReply = mongoose.model('QuickReply', quickReplySchema);

export default QuickReply;
