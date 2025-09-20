import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Use a default secret in development so the app works without .env
const SECRET = process.env.JWT_SECRET || 'devsecret-change-me';

const router = Router();

// Seed an initial admin if none exists (dev helper)
router.post('/seed-admin', async (req, res) => {
  const { firstName = 'Super', lastName = 'Admin', email = 'admin@local', password = 'admin123' } = req.body || {};
  const existing = await User.findOne({ role: 'admin' });
  if (existing) return res.json({ message: 'Admin already exists' });
  const admin = new User({ firstName, lastName, email, password, role: 'admin' });
  await admin.save();
  return res.json({ message: 'Admin created', admin: { id: admin._id, email: admin.email } });
});

// Dev helper: ensure an admin exists and return a ready-to-use token
router.post('/seed-admin-login', async (req, res) => {
  const { firstName = 'Super', lastName = 'Admin', email = 'admin@local', password = 'admin123' } = req.body || {};
  let admin = await User.findOne({ role: 'admin' });
  if (!admin){
    admin = new User({ firstName, lastName, email, password, role: 'admin' });
    await admin.save();
  }
  const token = jwt.sign({ id: admin._id, role: admin.role, firstName: admin.firstName, lastName: admin.lastName }, SECRET, { expiresIn: '7d' });
  return res.json({ token, user: { id: admin._id, role: admin.role, firstName: admin.firstName, lastName: admin.lastName, email: admin.email } });
})

router.post('/login', async (req, res) => {
  try{
    const rawEmail = (req.body && req.body.email) || ''
    const rawPassword = (req.body && req.body.password) || ''
    const emailInput = String(rawEmail || '').trim()
    const password = String(rawPassword || '')
    if (!emailInput || !password) return res.status(400).json({ message: 'Invalid credentials' })
    const emailLower = emailInput.toLowerCase()
    // Try exact match first (fast, uses index), then lower-case, then case-insensitive regex
    let user = await User.findOne({ email: emailInput })
    if (!user) user = await User.findOne({ email: emailLower })
    if (!user) {
      const esc = emailInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      user = await User.findOne({ email: { $regex: `^${esc}$`, $options: 'i' } })
    }
    if (!user) return res.status(400).json({ message: 'Invalid credentials' })
    const ok = await user.comparePassword(password)
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' })
    const token = jwt.sign({ id: user._id, role: user.role, firstName: user.firstName, lastName: user.lastName }, SECRET, { expiresIn: '7d' })
    return res.json({ token, user: { id: user._id, role: user.role, firstName: user.firstName, lastName: user.lastName, email: user.email } })
  }catch(err){
    return res.status(500).json({ message: 'Login failed' })
  }
});

export default router;
