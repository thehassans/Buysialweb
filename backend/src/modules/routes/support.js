import express from 'express'
import { auth, allowRoles } from '../middleware/auth.js'
import SupportTicket from '../models/SupportTicket.js'

const router = express.Router()

// Create ticket (any role)
router.post('/tickets', auth, allowRoles('admin','user','agent'), async (req, res) => {
  const { subject, body, tags } = req.body || {}
  if (!subject || !body) return res.status(400).json({ message: 'Subject and body are required' })
  const doc = new SupportTicket({
    subject,
    tags: Array.isArray(tags) ? tags : [],
    createdBy: req.user.id,
    createdByRole: req.user.role,
    messages: [{ sender: req.user.id, role: req.user.role, body }]
  })
  await doc.save()
  res.status(201).json({ message: 'Ticket created', ticket: doc })
})

// List tickets
router.get('/tickets', auth, allowRoles('admin','user','agent'), async (req, res) => {
  let match = {}
  if (req.user.role === 'admin') {
    match = {}
  } else if (req.user.role === 'user') {
    // user can see their own + their agents' tickets
    const User = (await import('../models/User.js')).default
    const agents = await User.find({ role:'agent', createdBy: req.user.id }, { _id:1 }).lean()
    const ids = agents.map(a=>a._id)
    match = { createdBy: { $in: [req.user.id, ...ids] } }
  } else {
    // agent sees own
    match = { createdBy: req.user.id }
  }
  const items = await SupportTicket.find(match).sort({ updatedAt: -1 }).select('subject status tags createdAt updatedAt createdBy createdByRole')
  res.json({ tickets: items })
})

// Ticket details
router.get('/tickets/:id', auth, allowRoles('admin','user','agent'), async (req, res) => {
  const t = await SupportTicket.findById(req.params.id)
  if (!t) return res.status(404).json({ message: 'Not found' })
  // authorization: user can view own/agents; agent own; admin all
  if (req.user.role === 'agent' && t.createdBy.toString() !== req.user.id) return res.status(403).json({ message:'Forbidden' })
  if (req.user.role === 'user'){
    const User = (await import('../models/User.js')).default
    const agents = await User.find({ role:'agent', createdBy: req.user.id }, { _id:1 }).lean()
    const ids = new Set([req.user.id, ...agents.map(a=>a._id.toString())])
    if (!ids.has(t.createdBy.toString())) return res.status(403).json({ message:'Forbidden' })
  }
  res.json({ ticket: t })
})

// Reply
router.post('/tickets/:id/reply', auth, allowRoles('admin','user','agent'), async (req, res) => {
  const { body } = req.body || {}
  if (!body) return res.status(400).json({ message: 'Missing body' })
  const t = await SupportTicket.findById(req.params.id)
  if (!t) return res.status(404).json({ message: 'Not found' })
  // same authorization as detail
  if (req.user.role === 'agent' && t.createdBy.toString() !== req.user.id) return res.status(403).json({ message:'Forbidden' })
  if (req.user.role === 'user'){
    const User = (await import('../models/User.js')).default
    const agents = await User.find({ role:'agent', createdBy: req.user.id }, { _id:1 }).lean()
    const ids = new Set([req.user.id, ...agents.map(a=>a._id.toString())])
    if (!ids.has(t.createdBy.toString())) return res.status(403).json({ message:'Forbidden' })
  }
  t.messages.push({ sender: req.user.id, role: req.user.role, body, createdAt: new Date() })
  await t.save()
  res.json({ message: 'Replied', ticket: t })
})

// Update status (admin or ticket owner)
router.post('/tickets/:id/status', auth, allowRoles('admin','user','agent'), async (req, res) => {
  const { status } = req.body || {}
  if (!['open','pending','closed'].includes(status)) return res.status(400).json({ message: 'Invalid status' })
  const t = await SupportTicket.findById(req.params.id)
  if (!t) return res.status(404).json({ message: 'Not found' })
  if (req.user.role !== 'admin' && t.createdBy.toString() !== req.user.id) return res.status(403).json({ message:'Forbidden' })
  t.status = status
  await t.save()
  res.json({ message: 'Status updated', ticket: t })
})

export default router
