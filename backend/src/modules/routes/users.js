import { Router } from 'express';
import User from '../models/User.js';
import Product from '../models/Product.js';
import { auth, allowRoles } from '../middleware/auth.js';
import { getIO } from '../config/socket.js';
// Lazy WhatsApp import to avoid startup crashes when WA is disabled or deps missing
async function getWA(){
  const enabled = process.env.ENABLE_WA !== 'false'
  if (!enabled) return { sendText: async ()=> ({ ok:true }) }
  try{ return await import('../services/whatsapp.js') }catch(_e){ return { sendText: async ()=> ({ ok:true }) } }
}
import ChatAssignment from '../models/ChatAssignment.js'
import Order from '../models/Order.js'
import mongoose from 'mongoose'

const router = Router();

// List users (admin)
router.get('/', auth, allowRoles('admin'), async (req, res) => {
  const users = await User.find({}, '-password').sort({ createdAt: -1 });
  res.json({ users });
});

// Create user (admin)
router.post('/', auth, allowRoles('admin'), async (req, res) => {
  const { firstName, lastName, email, phone, country, password, role = 'user' } = req.body;
  if (!firstName || !lastName || !email || !password) return res.status(400).json({ message: 'Missing required fields' });
  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ message: 'Email already in use' });
  const createdBy = req.user?.id;
  const user = new User({ firstName, lastName, email, phone, country, password, role, createdBy });
  await user.save();
  res.status(201).json({ message: 'User created', user: { id: user._id, firstName, lastName, email, phone, country, role } });
});

// Create agent (admin, user, manager with permission)
router.post('/agents', auth, allowRoles('admin','user','manager'), async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body || {}
  if (!firstName || !lastName || !email || !password) return res.status(400).json({ message: 'Missing required fields' })
  const exists = await User.findOne({ email })
  if (exists) return res.status(400).json({ message: 'Email already in use' })
  let createdBy = req.user?.id
  if (req.user.role === 'manager'){
    const mgr = await User.findById(req.user.id).select('managerPermissions createdBy')
    if (!mgr || !mgr.managerPermissions?.canCreateAgents){
      return res.status(403).json({ message: 'Manager not allowed to create agents' })
    }
    // Attribute agents to the owner so they appear under the user workspace
    createdBy = mgr.createdBy || req.user.id
  }
  const agent = new User({ firstName, lastName, email, phone, password, role: 'agent', createdBy })
  await agent.save()
  // Try to send WhatsApp welcome message (non-blocking)
  ;(async ()=>{
    try{
      const digits = String(phone||'').replace(/\D/g,'')
      if (digits) {
        const jid = `${digits}@s.whatsapp.net`
        const text = `Welcome to the team, ${firstName} ${lastName}!\nWe're excited to have you with us. You can log in to access your dashboard at web.buysial.com/login.\nHere are your login credentials: Email: ${email} Password: ${password}`
        const wa = await getWA()
        await wa.sendText(jid, text)
      }
    }catch(err){
      try { console.error('[agents] failed to send welcome WA', err?.message||err) } catch {}
    }
  })()
  res.status(201).json({ message: 'Agent created', user: { id: agent._id, firstName, lastName, email, phone, role: 'agent' } })
})

// List agents (admin => all, user => own, manager => owner's agents)
router.get('/agents', auth, allowRoles('admin','user','manager'), async (req, res) => {
  const { q = '' } = req.query || {}
  const base = { role: 'agent' }
  if (req.user.role === 'admin'){
    // no scoping
  } else if (req.user.role === 'user'){
    base.createdBy = req.user.id
  } else if (req.user.role === 'manager'){
    const mgr = await User.findById(req.user.id).select('createdBy')
    base.createdBy = mgr?.createdBy || '__none__'
  }
  const text = q.trim()
  const cond = text ? { ...base, $or: [
    { firstName: { $regex: text, $options: 'i' } },
    { lastName: { $regex: text, $options: 'i' } },
    { email: { $regex: text, $options: 'i' } },
    { phone: { $regex: text, $options: 'i' } },
  ] } : base
  const users = await User.find(cond, '-password').sort({ createdAt: -1 })
  res.json({ users })
})

// Agents performance metrics
router.get('/agents/performance', auth, allowRoles('admin','user','manager'), async (req, res) => {
  // Scope to caller
  const agentFilter = { role: 'agent' }
  if (req.user.role === 'admin'){
    // no scoping
  } else if (req.user.role === 'user'){
    agentFilter.createdBy = req.user.id
  } else if (req.user.role === 'manager'){
    const mgr = await User.findById(req.user.id).select('createdBy')
    agentFilter.createdBy = mgr?.createdBy || '__none__'
  }
  const agents = await User.find(agentFilter, '-password').sort({ createdAt: -1 })
  const agentIds = agents.map(a => a._id)

  // Assigned chats per agent
  const assignments = await ChatAssignment.aggregate([
    { $match: { assignedTo: { $in: agentIds } } },
    { $group: { _id: '$assignedTo', assigned: { $sum: 1 },
      avgResponseMs: { $avg: { $cond: [ { $and: ['$firstMessageAt', '$firstResponseAt'] }, { $subtract: ['$firstResponseAt', '$firstMessageAt'] }, null ] } } } }
  ])

  // Orders done per agent
  const ordersDone = await Order.aggregate([
    { $match: { createdBy: { $in: agentIds }, createdByRole: 'agent', status: 'shipped' } },
    { $group: { _id: '$createdBy', done: { $sum: 1 } } }
  ])

  const assignMap = new Map(assignments.map(a => [String(a._id), a]))
  const doneMap = new Map(ordersDone.map(o => [String(o._id), o]))

  const metrics = agents.map(a => {
    const asn = assignMap.get(String(a._id))
    const dn = doneMap.get(String(a._id))
    const avgMs = (asn && asn.avgResponseMs) || null
    return {
      id: a._id,
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      phone: a.phone,
      assigned: asn ? asn.assigned : 0,
      done: dn ? dn.done : 0,
      avgResponseSeconds: avgMs != null ? Math.round(avgMs / 1000) : null,
    }
  })

  res.json({ metrics })
})

// Delete agent (admin => any, user => own only, manager => owner's agents only)
router.delete('/agents/:id', auth, allowRoles('admin','user','manager'), async (req, res) => {
  const { id } = req.params
  const agent = await User.findOne({ _id: id, role: 'agent' })
  if (!agent) return res.status(404).json({ message: 'Agent not found' })
  if (req.user.role !== 'admin'){
    let ownerId = req.user.id
    if (req.user.role === 'manager'){
      const mgr = await User.findById(req.user.id).select('createdBy')
      ownerId = String(mgr?.createdBy || req.user.id)
    }
    if (String(agent.createdBy) !== String(ownerId)){
      return res.status(403).json({ message: 'Not allowed' })
    }
  }
  // Best-effort cleanup of related data (assignments etc.)
  try{ await ChatAssignment.deleteMany({ assignedTo: id }) }catch{}
  // Remove the agent user record (credentials removed with it)
  await User.deleteOne({ _id: id })
  // Notify workspace for live refresh
  try{
    const io = getIO()
    let ownerId = String(agent.createdBy || '')
    if (!ownerId){
      if (req.user.role === 'manager'){
        const mgr = await User.findById(req.user.id).select('createdBy')
        ownerId = String(mgr?.createdBy || req.user.id)
      } else {
        ownerId = String(req.user.id)
      }
    }
    if (ownerId) io.to(`workspace:${ownerId}`).emit('agent.deleted', { id: String(id) })
  }catch{}
  res.json({ message: 'Agent deleted' })
})

// Current user profile
router.get('/me', auth, async (req, res) => {
  const u = await User.findById(req.user.id, '-password')
  if (!u) return res.status(404).json({ message: 'User not found' })
  res.json({ user: u })
})

// Update current agent availability (Available / Away / Busy)
router.patch('/me/availability', auth, allowRoles('agent'), async (req, res) => {
  try{
    const { availability } = req.body || {}
    const allowed = ['available','away','busy']
    const val = String(availability || '').toLowerCase()
    if (!allowed.includes(val)){
      return res.status(400).json({ message: 'Invalid availability' })
    }
    const u = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { availability: val } },
      { new: true, projection: '-password' }
    )
    if (!u) return res.status(404).json({ message: 'User not found' })
    // Broadcast to workspace so owner/user assign modals refresh live
    try{
      const io = getIO()
      const ownerId = String(u.createdBy || '')
      if (ownerId){ io.to(`workspace:${ownerId}`).emit('agent.updated', { id: String(u._id), availability: u.availability }) }
      // Also notify the agent's own room
      io.to(`user:${String(u._id)}`).emit('me.updated', { availability: u.availability })
    }catch{}
    return res.json({ ok: true, user: u })
  }catch(err){
    return res.status(500).json({ message: err?.message || 'failed' })
  }
})

// Agent self performance: avg response time and quick counts
router.get('/agents/me/performance', auth, async (req, res) => {
  const userId = req.user.id
  // If caller is not agent, still allow to query own if they are a user/admin; scope remains to their id
  try{
    // Average response time from ChatAssignment
    const agg = await ChatAssignment.aggregate([
      { $match: { assignedTo: new mongoose.Types.ObjectId(userId) } },
      { $project: {
          diff: { $cond: [ { $and: ['$firstMessageAt', '$firstResponseAt'] }, { $subtract: ['$firstResponseAt', '$firstMessageAt'] }, null ] }
        }
      },
      { $group: { _id: null, avgMs: { $avg: '$diff' } } }
    ])
    const avgMs = (agg && agg[0] && agg[0].avgMs) || null

    // Orders quick counts for this agent
    const all = await Order.countDocuments({ createdBy: userId, createdByRole: 'agent' })
    const shipped = await Order.countDocuments({ createdBy: userId, createdByRole: 'agent', status: 'shipped' })

    res.json({ avgResponseSeconds: avgMs != null ? Math.round(avgMs/1000) : null, ordersSubmitted: all, ordersShipped: shipped })
  }catch(err){
    res.status(500).json({ error: err?.message || 'failed' })
  }
})

export default router;

// Managers CRUD
// List managers (admin => all, user => own)
router.get('/managers', auth, allowRoles('admin','user'), async (req, res) => {
  const { q = '' } = req.query || {}
  const base = { role: 'manager' }
  if (req.user.role !== 'admin') base.createdBy = req.user.id
  const text = q.trim()
  const cond = text ? { ...base, $or: [
    { firstName: { $regex: text, $options: 'i' } },
    { lastName: { $regex: text, $options: 'i' } },
    { email: { $regex: text, $options: 'i' } },
  ] } : base
  const users = await User.find(cond, '-password').sort({ createdAt: -1 })
  res.json({ users })
})

// Create manager (admin, user)
router.post('/managers', auth, allowRoles('admin','user'), async (req, res) => {
  const { firstName, lastName, email, password, phone, canCreateAgents=false, canManageProducts=false, canCreateOrders=false } = req.body || {}
  if (!firstName || !lastName || !email || !password) return res.status(400).json({ message: 'Missing required fields' })
  const exists = await User.findOne({ email })
  if (exists) return res.status(400).json({ message: 'Email already in use' })
  const createdBy = req.user?.id
  const manager = new User({ firstName, lastName, email, password, phone, role: 'manager', createdBy, managerPermissions: { canCreateAgents: !!canCreateAgents, canManageProducts: !!canManageProducts, canCreateOrders: !!canCreateOrders } })
  await manager.save()
  // Broadcast to workspace for real-time coordination
  try{ const io = getIO(); const ownerId = req.user.id; io.to(`workspace:${ownerId}`).emit('manager.created', { id: String(manager._id) }) }catch{}
  // Try to send WhatsApp welcome message (non-blocking)
  ;(async ()=>{
    try{
      const digits = String(phone||'').replace(/\D/g,'')
      if (digits) {
        const jid = `${digits}@s.whatsapp.net`
        const text = `Welcome to the team, ${firstName} ${lastName}!\nWe're excited to have you with us. You can log in to access your dashboard at web.buysial.com/login.\nHere are your login credentials: Email: ${email} Password: ${password}`
        const wa = await getWA()
        await wa.sendText(jid, text)
      }
    }catch(err){
      try { console.error('[managers] failed to send welcome WA', err?.message||err) } catch {}
    }
  })()
  res.status(201).json({ message: 'Manager created', user: { id: manager._id, firstName, lastName, email, role: 'manager', managerPermissions: manager.managerPermissions } })
})

// Delete manager (admin => any, user => own)
router.delete('/managers/:id', auth, allowRoles('admin','user'), async (req, res) => {
  const { id } = req.params
  const mgr = await User.findOne({ _id: id, role: 'manager' })
  if (!mgr) return res.status(404).json({ message: 'Manager not found' })
  if (req.user.role !== 'admin' && String(mgr.createdBy) !== String(req.user.id)){
    return res.status(403).json({ message: 'Not allowed' })
  }
  await User.deleteOne({ _id: id })
  try{
    const io = getIO()
    const ownerId = String(mgr.createdBy || req.user.id)
    if (ownerId) io.to(`workspace:${ownerId}`).emit('manager.deleted', { id: String(id) })
  }catch{}
  res.json({ message: 'Manager deleted' })
})

// Investors CRUD
// List investors (admin => all, user => own)
router.get('/investors', auth, allowRoles('admin','user'), async (req, res) => {
  const { q = '' } = req.query || {}
  const base = { role: 'investor' }
  if (req.user.role !== 'admin') base.createdBy = req.user.id
  const text = q.trim()
  const cond = text ? { ...base, $or: [
    { firstName: { $regex: text, $options: 'i' } },
    { lastName: { $regex: text, $options: 'i' } },
    { email: { $regex: text, $options: 'i' } },
    { phone: { $regex: text, $options: 'i' } },
  ] } : base
  const users = await User.find(cond, '-password').populate('investorProfile.assignedProducts.product', 'name baseCurrency price').sort({ createdAt: -1 })
  res.json({ users })
})

// Create investor (admin, user)
router.post('/investors', auth, allowRoles('admin','user'), async (req, res) => {
  const { firstName, lastName, email, password, phone, investmentAmount, currency, assignments } = req.body || {}
  if (!firstName || !lastName || !email || !password) return res.status(400).json({ message: 'Missing required fields' })
  const exists = await User.findOne({ email })
  if (exists) return res.status(400).json({ message: 'Email already in use' })
  // Validate currency
  const CUR = ['AED','SAR','OMR','BHD']
  const cur = CUR.includes(currency) ? currency : 'SAR'
  // Validate products list
  const assignedProducts = []
  if (Array.isArray(assignments)){
    for (const it of assignments){
      const pid = it?.productId || it?.product
      if (!pid) continue
      const prod = await Product.findById(pid).select('_id')
      if (!prod) continue
      const ppu = Number(it?.profitPerUnit || 0)
      assignedProducts.push({ product: prod._id, profitPerUnit: Math.max(0, ppu) })
    }
  }
  const createdBy = req.user?.id
  const investor = new User({
    firstName, lastName, email, password, phone, role: 'investor', createdBy,
    investorProfile: { investmentAmount: Math.max(0, Number(investmentAmount||0)), currency: cur, assignedProducts }
  })
  await investor.save()
  // Broadcast: owner workspace should refresh investors; investor self can refresh dashboard
  try{ const io = getIO(); io.to(`workspace:${createdBy}`).emit('investor.created', { id: String(investor._id) }); io.to(`user:${String(investor._id)}`).emit('investor.updated', { id: String(investor._id) }) }catch{}
  // Try to send WhatsApp welcome message (non-blocking)
  ;(async ()=>{
    try{
      const digits = String(phone||'').replace(/\D/g,'')
      if (digits) {
        const jid = `${digits}@s.whatsapp.net`
        const text = `Welcome to the team, ${firstName} ${lastName}!\nWe're excited to have you with us. You can log in to access your dashboard at web.buysial.com/login.\nHere are your login credentials: Email: ${email} Password: ${password}`
        const wa = await getWA()
        await wa.sendText(jid, text)
      }
    }catch(err){
      try { console.error('[investors] failed to send welcome WA', err?.message||err) } catch {}
    }
  })()
  const populated = await User.findById(investor._id, '-password').populate('investorProfile.assignedProducts.product', 'name')
  res.status(201).json({ message: 'Investor created', user: populated })
})

// Delete investor (admin => any, user => own)
router.delete('/investors/:id', auth, allowRoles('admin','user'), async (req, res) => {
  const { id } = req.params
  const inv = await User.findOne({ _id: id, role: 'investor' })
  if (!inv) return res.status(404).json({ message: 'Investor not found' })
  if (req.user.role !== 'admin' && String(inv.createdBy) !== String(req.user.id)){
    return res.status(403).json({ message: 'Not allowed' })
  }
  await User.deleteOne({ _id: id })
  try{
    const io = getIO()
    const ownerId = String(inv.createdBy || req.user.id)
    if (ownerId) io.to(`workspace:${ownerId}`).emit('investor.deleted', { id: String(id) })
  }catch{}
  res.json({ message: 'Investor deleted' })
})

// Investor metrics for owner (admin, user)
router.get('/investors/:id/metrics', auth, allowRoles('admin','user'), async (req, res) => {
  const { id } = req.params
  const inv = await User.findById(id).populate('investorProfile.assignedProducts.product', 'name price baseCurrency')
  if (!inv || inv.role !== 'investor') return res.status(404).json({ message: 'Investor not found' })
  if (req.user.role !== 'admin' && String(inv.createdBy) !== String(req.user.id)){
    return res.status(403).json({ message: 'Not allowed' })
  }
  const ownerId = inv.createdBy
  const assigned = inv.investorProfile?.assignedProducts || []
  const productIds = assigned.map(a => a.product?._id || a.product).filter(Boolean)
  if (productIds.length === 0){
    return res.json({
      currency: inv.investorProfile?.currency || 'SAR',
      investmentAmount: inv.investorProfile?.investmentAmount || 0,
      unitsSold: 0,
      totalProfit: 0,
      totalSaleValue: 0,
      breakdown: []
    })
  }
  const RATES = {
    SAR: { SAR: 1, AED: 0.98, OMR: 0.10, BHD: 0.10 },
    AED: { SAR: 1.02, AED: 1, OMR: 0.10, BHD: 0.10 },
    OMR: { SAR: 9.78, AED: 9.58, OMR: 1, BHD: 0.98 },
    BHD: { SAR: 9.94, AED: 9.74, OMR: 1.02, BHD: 1 },
  }
  function convertPrice(val, from, to){ const r = RATES?.[from]?.[to]; return r ? (Number(val||0) * r) : Number(val||0) }
  const agents = await User.find({ role: 'agent', createdBy: ownerId }, { _id: 1 }).lean()
  const managers = await User.find({ role: 'manager', createdBy: ownerId }, { _id: 1 }).lean()
  const creatorIds = [ ownerId, ...agents.map(a=>a._id), ...managers.map(m=>m._id) ]
  const orders = await Order.aggregate([
    { $match: { productId: { $in: productIds }, createdBy: { $in: creatorIds }, $or: [ { status: 'shipped' }, { shipmentStatus: 'delivered' } ] } },
    { $group: { _id: '$productId', unitsSold: { $sum: '$quantity' } } }
  ])
  const unitsMap = new Map(orders.map(o => [ String(o._id), o.unitsSold ]))
  let totalUnits = 0
  let totalProfit = 0
  let totalSaleValue = 0
  const breakdown = assigned.map(a => {
    const pid = String(a.product?._id || a.product)
    const units = Number(unitsMap.get(pid) || 0)
    totalUnits += units
    const profit = units * Number(a.profitPerUnit || 0)
    totalProfit += profit
    const base = a.product?.baseCurrency || 'SAR'
    const price = Number(a.product?.price || 0)
    const invCur = inv.investorProfile?.currency || 'SAR'
    const convertedUnitPrice = convertPrice(price, base, invCur)
    const saleValue = units * convertedUnitPrice
    totalSaleValue += saleValue
    return { productId: pid, productName: a.product?.name || '', unitsSold: units, profit, saleValue }
  })
  res.json({ currency: inv.investorProfile?.currency || 'SAR', investmentAmount: inv.investorProfile?.investmentAmount || 0, unitsSold: totalUnits, totalProfit, totalSaleValue, breakdown })
})

// Drivers CRUD
// List drivers (admin => all, user => own, manager => owner's drivers)
router.get('/drivers', auth, allowRoles('admin','user','manager'), async (req, res) => {
  const { q = '' } = req.query || {}
  const base = { role: 'driver' }
  if (req.user.role === 'admin'){
    // no extra scoping
  } else if (req.user.role === 'user'){
    base.createdBy = req.user.id
  } else if (req.user.role === 'manager'){
    const mgr = await User.findById(req.user.id).select('createdBy')
    base.createdBy = mgr?.createdBy || '__none__'
  }
  const text = q.trim()
  const cond = text ? { ...base, $or: [
    { firstName: { $regex: text, $options: 'i' } },
    { lastName: { $regex: text, $options: 'i' } },
    { email: { $regex: text, $options: 'i' } },
    { phone: { $regex: text, $options: 'i' } },
    { country: { $regex: text, $options: 'i' } },
    { city: { $regex: text, $options: 'i' } },
  ] } : base
  const users = await User.find(cond, '-password').sort({ createdAt: -1 })
  res.json({ users })
})

// Create driver (admin, user)
router.post('/drivers', auth, allowRoles('admin','user'), async (req, res) => {
  const { firstName, lastName, email, password, phone, country='', city='' } = req.body || {}
  if (!firstName || !lastName || !email || !password) return res.status(400).json({ message: 'Missing required fields' })
  const exists = await User.findOne({ email })
  if (exists) return res.status(400).json({ message: 'Email already in use' })
  const createdBy = req.user?.id
  const driver = new User({ firstName, lastName, email, password, phone, country, city, role: 'driver', createdBy })
  await driver.save()
  // Broadcast to workspace so managers/owners can see the new driver immediately
  try{ const io = getIO(); io.to(`workspace:${createdBy}`).emit('driver.created', { id: String(driver._id) }) }catch{}
  // Try to send WhatsApp welcome message (non-blocking)
  ;(async ()=>{
    try{
      const digits = String(phone||'').replace(/\D/g,'')
      if (digits) {
        const jid = `${digits}@s.whatsapp.net`
        const text = `Welcome to the team, ${firstName} ${lastName}!\nWe're excited to have you with us. You can log in to access your dashboard at web.buysial.com/login.\nHere are your login credentials: Email: ${email} Password: ${password}`
        const wa = await getWA()
        await wa.sendText(jid, text)
      }
    }catch(err){
      try { console.error('[drivers] failed to send welcome WA', err?.message||err) } catch {}
    }
  })()
  res.status(201).json({ message: 'Driver created', user: { id: driver._id, firstName, lastName, email, phone, country, city, role: 'driver' } })
})

// Delete driver (admin => any, user => own)
router.delete('/drivers/:id', auth, allowRoles('admin','user'), async (req, res) => {
  const { id } = req.params
  const driver = await User.findOne({ _id: id, role: 'driver' })
  if (!driver) return res.status(404).json({ message: 'Driver not found' })
  if (req.user.role !== 'admin' && String(driver.createdBy) !== String(req.user.id)){
    return res.status(403).json({ message: 'Not allowed' })
  }
  await User.deleteOne({ _id: id })
  try{
    const io = getIO()
    const ownerId = String(driver.createdBy || req.user.id)
    if (ownerId) io.to(`workspace:${ownerId}`).emit('driver.deleted', { id: String(id) })
  }catch{}
  res.json({ message: 'Driver deleted' })
})
// Investor self metrics (investor)
router.get('/investors/me/metrics', auth, allowRoles('investor'), async (req, res) => {
  const inv = await User.findById(req.user.id).populate('investorProfile.assignedProducts.product', 'name price baseCurrency')
  if (!inv || inv.role !== 'investor') return res.status(404).json({ message: 'Investor not found' })
  const ownerId = inv.createdBy
  const assigned = inv.investorProfile?.assignedProducts || []
  const productIds = assigned.map(a => a.product?._id || a.product).filter(Boolean)
  if (productIds.length === 0){
    return res.json({ currency: inv.investorProfile?.currency || 'SAR', investmentAmount: inv.investorProfile?.investmentAmount || 0, unitsSold: 0, totalProfit: 0, totalSaleValue: 0, breakdown: [] })
  }
  const RATES = {
    SAR: { SAR: 1, AED: 0.98, OMR: 0.10, BHD: 0.10 },
    AED: { SAR: 1.02, AED: 1, OMR: 0.10, BHD: 0.10 },
    OMR: { SAR: 9.78, AED: 9.58, OMR: 1, BHD: 0.98 },
    BHD: { SAR: 9.94, AED: 9.74, OMR: 1.02, BHD: 1 },
  }
  function convertPrice(val, from, to){ const r = RATES?.[from]?.[to]; return r ? (Number(val||0) * r) : Number(val||0) }
  const agents = await User.find({ role: 'agent', createdBy: ownerId }, { _id: 1 }).lean()
  const managers = await User.find({ role: 'manager', createdBy: ownerId }, { _id: 1 }).lean()
  const creatorIds = [ ownerId, ...agents.map(a=>a._id), ...managers.map(m=>m._id) ]
  const orders = await Order.aggregate([
    { $match: { productId: { $in: productIds }, createdBy: { $in: creatorIds }, $or: [ { status: 'shipped' }, { shipmentStatus: 'delivered' } ] } },
    { $group: { _id: '$productId', unitsSold: { $sum: '$quantity' } } }
  ])
  const unitsMap = new Map(orders.map(o => [ String(o._id), o.unitsSold ]))
  let totalUnits = 0
  let totalProfit = 0
  let totalSaleValue = 0
  const breakdown = assigned.map(a => {
    const pid = String(a.product?._id || a.product)
    const units = Number(unitsMap.get(pid) || 0)
    totalUnits += units
    const profit = units * Number(a.profitPerUnit || 0)
    totalProfit += profit
    const base = a.product?.baseCurrency || 'SAR'
    const price = Number(a.product?.price || 0)
    const invCur = inv.investorProfile?.currency || 'SAR'
    const convertedUnitPrice = convertPrice(price, base, invCur)
    const saleValue = units * convertedUnitPrice
    totalSaleValue += saleValue
    return { productId: pid, productName: a.product?.name || '', unitsSold: units, profit, saleValue }
  })
  res.json({ currency: inv.investorProfile?.currency || 'SAR', investmentAmount: inv.investorProfile?.investmentAmount || 0, unitsSold: totalUnits, totalProfit, totalSaleValue, breakdown })
})
