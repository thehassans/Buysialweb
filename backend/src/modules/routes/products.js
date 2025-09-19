import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import Product from '../models/Product.js'
import User from '../models/User.js'
import { auth, allowRoles } from '../middleware/auth.js'

const router = express.Router()

// Ensure uploads directory exists
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now()
    const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    cb(null, `${ts}_${safe}`)
  }
})
const upload = multer({ storage })

// Create product (admin, user, manager with permission)
router.post('/', auth, allowRoles('admin','user','manager'), upload.any(), async (req, res) => {
  const { name, price, availableCountries, inStock, stockQty, baseCurrency, purchasePrice, category, madeInCountry, description, stockUAE, stockOman, stockKSA, stockBahrain } = req.body || {}
  if (!name || price == null) return res.status(400).json({ message: 'Missing required fields' })
  // Map creator: managers attribute to owner (createdBy of manager)
  let ownerId = req.user.id
  if (req.user.role === 'manager'){
    const mgr = await User.findById(req.user.id).select('managerPermissions createdBy')
    if (!mgr || !mgr.managerPermissions?.canManageProducts){
      return res.status(403).json({ message: 'Manager not allowed to manage products' })
    }
    ownerId = String(mgr.createdBy || req.user.id)
  }
  const parsedCountries = Array.isArray(availableCountries) ? availableCountries : (typeof availableCountries === 'string' && availableCountries.length ? availableCountries.split(',') : [])
  // Gather images (support 'images' array or legacy 'image')
  const files = Array.isArray(req.files) ? req.files : []
  const imageFiles = files.filter(f => f.fieldname === 'images' || f.fieldname === 'image')
  const imagePaths = imageFiles.map(f => `/uploads/${f.filename}`)
  const stockByCountry = {
    UAE: stockUAE != null ? Math.max(0, Number(stockUAE)) : 0,
    Oman: stockOman != null ? Math.max(0, Number(stockOman)) : 0,
    KSA: stockKSA != null ? Math.max(0, Number(stockKSA)) : 0,
    Bahrain: stockBahrain != null ? Math.max(0, Number(stockBahrain)) : 0,
  }
  const totalQty = (stockByCountry.UAE + stockByCountry.Oman + stockByCountry.KSA + stockByCountry.Bahrain)
  const doc = new Product({
    name: String(name).trim(),
    price: Number(price),
    baseCurrency: ['AED','OMR','SAR','BHD'].includes(baseCurrency) ? baseCurrency : 'SAR',
    availableCountries: parsedCountries,
    inStock: inStock === 'true' || inStock === true,
    stockQty: stockQty != null ? Math.max(0, Number(stockQty)) : totalQty,
    stockByCountry,
    imagePath: imagePaths[0] || '',
    images: imagePaths,
    purchasePrice: purchasePrice != null ? Number(purchasePrice) : 0,
    category: ['Skincare','Haircare','Bodycare','Other'].includes(category) ? category : 'Other',
    madeInCountry: madeInCountry || '',
    description: description || '',
    createdBy: ownerId,
  })
  await doc.save()
  res.status(201).json({ message: 'Product created', product: doc })
})

// List products (admin => all; agent => all; user => own; manager => owner's)
router.get('/', auth, allowRoles('admin','user','agent','manager'), async (req, res) => {
  let base = {}
  if (req.user.role === 'admin' || req.user.role === 'agent') base = {}
  else if (req.user.role === 'user') base = { createdBy: req.user.id }
  else if (req.user.role === 'manager'){
    const mgr = await User.findById(req.user.id).select('createdBy')
    base = { createdBy: mgr?.createdBy || '__none__' }
  }
  const products = await Product.find(base).sort({ createdAt: -1 })
  res.json({ products })
})

// Update product (admin; user owner; manager with permission on owner's products)
router.patch('/:id', auth, allowRoles('admin','user','manager'), upload.any(), async (req, res) => {
  const { id } = req.params
  const prod = await Product.findById(id)
  if (!prod) return res.status(404).json({ message: 'Product not found' })
  if (req.user.role !== 'admin'){
    let ownerId = req.user.id
    if (req.user.role === 'manager'){
      const mgr = await User.findById(req.user.id).select('managerPermissions createdBy')
      if (!mgr || !mgr.managerPermissions?.canManageProducts){ return res.status(403).json({ message: 'Manager not allowed to manage products' }) }
      ownerId = String(mgr.createdBy || req.user.id)
    }
    if (String(prod.createdBy) !== String(ownerId)) return res.status(403).json({ message: 'Not allowed' })
  }
  const { name, price, availableCountries, inStock, stockQty, baseCurrency, purchasePrice, category, madeInCountry, description, stockUAE, stockOman, stockKSA, stockBahrain } = req.body || {}
  if (name != null) prod.name = String(name).trim()
  if (price != null) prod.price = Number(price)
  if (baseCurrency != null && ['AED','OMR','SAR','BHD'].includes(baseCurrency)) prod.baseCurrency = baseCurrency
  if (availableCountries != null) prod.availableCountries = Array.isArray(availableCountries) ? availableCountries : (typeof availableCountries === 'string' ? availableCountries.split(',') : [])
  if (inStock != null) prod.inStock = inStock === 'true' || inStock === true
  if (stockQty != null) prod.stockQty = Math.max(0, Number(stockQty))
  if (purchasePrice != null) prod.purchasePrice = Number(purchasePrice)
  if (category != null && ['Skincare','Haircare','Bodycare','Other'].includes(category)) prod.category = category
  if (madeInCountry != null) prod.madeInCountry = String(madeInCountry)
  if (description != null) prod.description = String(description)
  // per-country stock updates
  const sbc = { ...(prod.stockByCountry || { UAE:0, Oman:0, KSA:0, Bahrain:0 }) }
  if (stockUAE != null) sbc.UAE = Math.max(0, Number(stockUAE))
  if (stockOman != null) sbc.Oman = Math.max(0, Number(stockOman))
  if (stockKSA != null) sbc.KSA = Math.max(0, Number(stockKSA))
  if (stockBahrain != null) sbc.Bahrain = Math.max(0, Number(stockBahrain))
  prod.stockByCountry = sbc
  // if client didn't send stockQty explicitly, recompute from per-country
  if (stockQty == null && (stockUAE != null || stockOman != null || stockKSA != null || stockBahrain != null)){
    prod.stockQty = (sbc.UAE + sbc.Oman + sbc.KSA + sbc.Bahrain)
  }
  const files = Array.isArray(req.files) ? req.files : []
  const imageFiles = files.filter(f => f.fieldname === 'images' || f.fieldname === 'image')
  if (imageFiles.length){
    const imagePaths = imageFiles.map(f => `/uploads/${f.filename}`)
    prod.imagePath = imagePaths[0]
    prod.images = imagePaths
  }
  await prod.save()
  res.json({ message: 'Updated', product: prod })
})

// Delete product (admin; user owner; manager with permission on owner's products)
router.delete('/:id', auth, allowRoles('admin','user','manager'), async (req, res) => {
  const { id } = req.params
  const prod = await Product.findById(id)
  if (!prod) return res.status(404).json({ message: 'Product not found' })
  if (req.user.role !== 'admin'){
    let ownerId = req.user.id
    if (req.user.role === 'manager'){
      const mgr = await User.findById(req.user.id).select('managerPermissions createdBy')
      if (!mgr || !mgr.managerPermissions?.canManageProducts){ return res.status(403).json({ message: 'Manager not allowed to manage products' }) }
      ownerId = String(mgr.createdBy || req.user.id)
    }
    if (String(prod.createdBy) !== String(ownerId)) return res.status(403).json({ message: 'Not allowed' })
  }
  await Product.deleteOne({ _id: id })
  res.json({ message: 'Deleted' })
})

export default router
