const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'wareport_secret_key_change_this';

function userAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.adminToken;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { userAuth, adminAuth };
