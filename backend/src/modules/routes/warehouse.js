import express from 'express'
import { auth, allowRoles } from '../middleware/auth.js'
import Product from '../models/Product.js'
import Order from '../models/Order.js'

const router = express.Router()

// GET /api/warehouse/summary
router.get('/summary', auth, allowRoles('admin','user'), async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const productQuery = isAdmin ? {} : { createdBy: req.user.id }

    const products = await Product.find(productQuery).sort({ name: 1 })
    const productIds = products.map(p => p._id)

    const orderMatch = { status: 'shipped', productId: { $in: productIds } }
    if (!isAdmin) orderMatch.createdBy = req.user.id

    // Aggregate shipped quantities per product and country
    const shippedAgg = await Order.aggregate([
      { $match: orderMatch },
      { $group: {
          _id: { productId: '$productId', country: '$orderCountry' },
          shippedQty: { $sum: { $ifNull: ['$quantity', 1] } },
        }
      }
    ])

    const shippedMap = new Map()
    for (const row of shippedAgg) {
      const pid = String(row._id.productId)
      const country = row._id.country || 'Unknown'
      if (!shippedMap.has(pid)) shippedMap.set(pid, {})
      shippedMap.get(pid)[country] = row.shippedQty
    }

    const response = products.map(p => {
      const byC = p.stockByCountry || {}
      const leftUAE = byC.UAE || 0
      const leftOman = byC.Oman || 0
      const leftKSA = byC.KSA || 0
      const leftBahrain = byC.Bahrain || 0
      const totalLeft = leftUAE + leftOman + leftKSA + leftBahrain

      const sMap = shippedMap.get(String(p._id)) || {}
      const shipUAE = sMap.UAE || 0
      const shipOman = sMap.Oman || 0
      const shipKSA = sMap.KSA || 0
      const shipBahrain = sMap.Bahrain || 0
      const totalShipped = shipUAE + shipOman + shipKSA + shipBahrain

      const totalBought = totalLeft + totalShipped

      return {
        _id: p._id,
        name: p.name,
        price: p.price,
        purchasePrice: p.purchasePrice || 0,
        stockLeft: { UAE: leftUAE, Oman: leftOman, KSA: leftKSA, Bahrain: leftBahrain, total: totalLeft },
        shipped: { UAE: shipUAE, Oman: shipOman, KSA: shipKSA, Bahrain: shipBahrain, total: totalShipped },
        totalBought,
        stockValue: totalLeft * (p.purchasePrice || 0),
        potentialRevenue: totalLeft * (p.price || 0),
        shippedRevenue: totalShipped * (p.price || 0),
        createdAt: p.createdAt,
      }
    })

    res.json({ items: response })
  } catch (err) {
    console.error('warehouse summary error', err)
    res.status(500).json({ message: 'Failed to load summary' })
  }
})

export default router
