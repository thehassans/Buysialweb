import mongoose from 'mongoose'

const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true })

export default mongoose.model('Setting', SettingSchema)
