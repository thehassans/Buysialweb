import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Use a default secret in development so the app works without .env
const SECRET = process.env.JWT_SECRET || 'devsecret-change-me';

export async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, SECRET);
    // Ensure user still exists (revokes access when a user is deleted)
    const user = await User.findById(decoded.id).select('_id role');
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    req.user = { ...decoded, id: String(user._id), role: user.role };
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}
