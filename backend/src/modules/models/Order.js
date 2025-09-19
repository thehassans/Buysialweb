import mongoose from 'mongoose'

const OrderSchema = new mongoose.Schema({
  customerPhone: { type: String, required: true },
  phoneCountryCode: { type: String, default: '' },
  orderCountry: { type: String, default: '' },
  city: { type: String, default: '' },
  customerAddress: { type: String, default: '' },
  locationLat: { type: Number },
  locationLng: { type: Number },
  customerLocation: { type: String, default: '' },

  details: { type: String, default: '' },

  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: { type: Number, default: 1, min: 1 },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByRole: { type: String, enum: ['admin','user','agent','manager'], required: true },

  // Shipment
  shipmentMethod: { type: String, default: 'none' },
  courierName: { type: String },
  trackingNumber: { type: String },
  deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shippingFee: { type: Number, default: 0 },
  codAmount: { type: Number, default: 0 },
  collectedAmount: { type: Number, default: 0 },
  balanceDue: { type: Number, default: 0 },

  status: { type: String, default: 'pending' },
  shipmentStatus: { type: String, default: 'pending' },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },

  // Returns / delivery info
  deliveryNotes: { type: String },
  returnReason: { type: String },

  // Settlements
  receivedFromCourier: { type: Number, default: 0 },
  settled: { type: Boolean, default: false },
  settledAt: { type: Date },
  settledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  invoiceNumber: { type: String },
  total: { type: Number },
  discount: { type: Number, default: 0 },
}, { timestamps: true })

export default mongoose.model('Order', OrderSchema)
