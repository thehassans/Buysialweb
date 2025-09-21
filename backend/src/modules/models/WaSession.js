import mongoose from 'mongoose'

const WaSessionSchema = new mongoose.Schema({
  number: { type: String, required: true }, // full JID e.g. 971501234567@s.whatsapp.net
  phone: { type: String, required: true },  // digits only e.g. 971501234567
  connectedAt: { type: Date, default: Date.now },
  disconnectedAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
})

WaSessionSchema.index({ phone: 1, connectedAt: -1 })
WaSessionSchema.index({ active: 1 })

export default mongoose.models.WaSession || mongoose.model('WaSession', WaSessionSchema)
