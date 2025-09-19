import express from 'express'
import { auth, allowRoles } from '../middleware/auth.js'
import Expense from '../models/Expense.js'
import Order from '../models/Order.js'

const router = express.Router()

// Create expense (admin, user, agent)
router.post('/expenses', auth, allowRoles('admin','user','agent'), async (req, res) => {
  const { title, category, amount, currency, notes, incurredAt } = req.body || {}
  if (!title || amount == null) return res.status(400).json({ message: 'Missing title or amount' })
  const doc = new Expense({ title, category, amount: Math.max(0, Number(amount||0)), currency: currency||'SAR', notes, incurredAt: incurredAt ? new Date(incurredAt) : new Date(), createdBy: req.user.id })
  await doc.save()
  res.status(201).json({ message: 'Expense created', expense: doc })
})

// List expenses (admin => all; user => own+agents; agent => own)
router.get('/expenses', auth, allowRoles('admin','user','agent'), async (req, res) => {
  let match = {}
  if (req.user.role === 'admin') {
    match = {}
  } else if (req.user.role === 'user'){
    const User = (await import('../models/User.js')).default
    const agents = await User.find({ role:'agent', createdBy: req.user.id }, { _id:1 }).lean()
    const ids = agents.map(a=>a._id.toString())
    match = { createdBy: { $in: [req.user.id, ...ids] } }
  } else {
    match = { createdBy: req.user.id }
  }
  const items = await Expense.find(match).sort({ incurredAt: -1 })
  const total = items.reduce((a,b)=> a + Number(b.amount||0), 0)
  res.json({ expenses: items, total })
})

// Transactions: derive from orders and expenses
router.get('/transactions', auth, allowRoles('admin','user'), async (req, res) => {
  // Optional: ?start=ISO&end=ISO
  const start = req.query.start ? new Date(req.query.start) : null
  const end = req.query.end ? new Date(req.query.end) : null

  // scope orders
  let matchOrders = {}
  if (start || end){ matchOrders.createdAt = {} ; if (start) matchOrders.createdAt.$gte = start ; if (end) matchOrders.createdAt.$lte = end }
  if (req.user.role === 'user'){
    const User = (await import('../models/User.js')).default
    const agents = await User.find({ role:'agent', createdBy: req.user.id }, { _id:1 }).lean()
    const ids = agents.map(a=>a._id)
    matchOrders.createdBy = { $in: [req.user.id, ...ids] }
  }
  const orders = await Order.find(matchOrders).lean()

  // scope expenses
  let matchExp = {}
  if (start || end){ matchExp.incurredAt = {} ; if (start) matchExp.incurredAt.$gte = start ; if (end) matchExp.incurredAt.$lte = end }
  if (req.user.role === 'user'){
    const User = (await import('../models/User.js')).default
    const agents = await User.find({ role:'agent', createdBy: req.user.id }, { _id:1 }).lean()
    const ids = agents.map(a=>a._id)
    matchExp.createdBy = { $in: [req.user.id, ...ids] }
  }
  const expenses = await Expense.find(matchExp).lean()

  // Build transactions
  const tx = []
  for (const o of orders){
    // credit: money received from courier on settlement OR collected cash on delivery
    if (o.settled && o.receivedFromCourier > 0){
      tx.push({ date: o.settledAt || o.updatedAt || o.createdAt, type:'credit', source:'settlement', ref:`ORD-${o._id}`, amount: Number(o.receivedFromCourier||0), currency:'SAR', notes:'Courier settlement' })
    } else if ((o.collectedAmount||0) > 0 && String(o.shipmentStatus||'').toLowerCase()==='delivered'){
      tx.push({ date: o.deliveredAt || o.updatedAt || o.createdAt, type:'credit', source:'delivery', ref:`ORD-${o._id}`, amount: Number(o.collectedAmount||0), currency:'SAR', notes:'COD collected' })
    }
    // debits: shipping fee
    if ((o.shippingFee||0) > 0){
      tx.push({ date: o.updatedAt || o.createdAt, type:'debit', source:'shipping', ref:`ORD-${o._id}`, amount: Number(o.shippingFee||0), currency:'SAR', notes:'Shipping cost' })
    }
  }
  for (const e of expenses){
    tx.push({ date: e.incurredAt || e.createdAt, type:'debit', source:'expense', ref:`EXP-${e._id}`, amount: Number(e.amount||0), currency: e.currency||'SAR', notes: e.title })
  }

  tx.sort((a,b)=> new Date(b.date) - new Date(a.date))

  const totals = tx.reduce((acc, t)=>{
    if (t.type==='credit') acc.credits += t.amount; else acc.debits += t.amount; acc.net = acc.credits - acc.debits; return acc
  }, { credits:0, debits:0, net:0 })

  res.json({ transactions: tx, totals })
})

export default router
