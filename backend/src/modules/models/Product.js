import mongoose from 'mongoose'

const StockByCountrySchema = new mongoose.Schema({
  UAE: { type: Number, default: 0 },
  Oman: { type: Number, default: 0 },
  KSA: { type: Number, default: 0 },
  Bahrain: { type: Number, default: 0 },
}, { _id: false })

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  baseCurrency: { type: String, enum: ['AED','OMR','SAR','BHD'], default: 'SAR' },
  availableCountries: [{ type: String }],
  inStock: { type: Boolean, default: true },
  stockQty: { type: Number, default: 0 },
  stockByCountry: { type: StockByCountrySchema, default: () => ({}) },
  imagePath: { type: String, default: '' },
  images: [{ type: String }],
  purchasePrice: { type: Number, default: 0 },
  category: { type: String, enum: ['Skincare','Haircare','Bodycare','Other'], default: 'Other' },
  madeInCountry: { type: String, default: '' },
  description: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

export default mongoose.model('Product', ProductSchema)
