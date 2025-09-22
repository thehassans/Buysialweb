import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const UserSchema = new mongoose.Schema({
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  email: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  country: { type: String, default: '' },
  city: { type: String, default: '' },
  role: { type: String, enum: ['admin','user','agent','manager','investor','driver'], default: 'user', index: true },
  // Agent availability status for assignment visibility and routing
  availability: { type: String, enum: ['available','away','busy','offline'], default: 'available', index: true },
  // For agents/managers/investors created by a user/company (workspace owner)
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Manager-specific permission flags (only applicable when role === 'manager')
  managerPermissions: {
    canCreateAgents: { type: Boolean, default: false },
    canManageProducts: { type: Boolean, default: false },
    canCreateOrders: { type: Boolean, default: false },
  },
  // Auto welcome message status (set on agent creation best-effort)
  welcomeSent: { type: Boolean, default: false },
  welcomeSentAt: { type: Date },
  welcomeError: { type: String, default: '' },
  // Investor specific profile (only applicable when role === 'investor')
  investorProfile: {
    investmentAmount: { type: Number, default: 0 },
    currency: { type: String, enum: ['AED','SAR','OMR','BHD'], default: 'SAR' },
    assignedProducts: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      profitPerUnit: { type: Number, default: 0 },
    }],
  },
}, { timestamps: true })

UserSchema.pre('save', async function(next){
  if (!this.isModified('password')) return next()
  try{
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  }catch(err){ next(err) }
})

UserSchema.methods.comparePassword = async function(plain){
  try{ return await bcrypt.compare(plain, this.password) }catch{ return false }
}

export default mongoose.model('User', UserSchema)
