import mongoose from 'mongoose'

const ExpenseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, default: 'general' },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'SAR' },
  notes: { type: String },
  incurredAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

export default mongoose.model('Expense', ExpenseSchema)
