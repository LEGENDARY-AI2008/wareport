const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { adminAuth } = require('../middleware/auth');
const { fireReport, getActiveCount } = require('../sessions/sessionManager');

const JWT_SECRET = process.env.JWT_SECRET || 'wareport_secret_key_change_this';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'IFEJESU88';

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });

    const token = jwt.sign({ isAdmin: true, username: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats overview
router.get('/stats', adminAuth, (req, res) => {
  const totalUsers = db.prepare(`SELECT COUNT(*) as c FROM users`).get().c;
  const totalSessions = db.prepare(`SELECT COUNT(*) as c FROM sessions`).get().c;
  const activeSessions = db.prepare(`SELECT COUNT(*) as c FROM sessions WHERE status='active'`).get().c;
  const totalReports = db.prepare(`SELECT COUNT(*) as c FROM report_logs`).get().c;
  const recentReports = db.prepare(`SELECT * FROM report_logs ORDER BY created_at DESC LIMIT 10`).all();

  res.json({
    totalUsers,
    totalSessions,
    activeSessions,
    socketCount: getActiveCount(),
    totalReports,
    recentReports
  });
});

// All users
router.get('/users', adminAuth, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.phone, u.unique_id, u.created_at,
           COUNT(s.id) as session_count,
           SUM(CASE WHEN s.status='active' THEN 1 ELSE 0 END) as active_sessions
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json({ users });
});

// Delete user
router.delete('/users/:id', adminAuth, (req, res) => {
  db.prepare(`DELETE FROM users WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

// All sessions
router.get('/sessions', adminAuth, (req, res) => {
  const sessions = db.prepare(`
    SELECT s.*, u.phone as owner_phone, u.unique_id as owner_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    ORDER BY s.paired_at DESC
  `).all();
  res.json({ sessions });
});

// Admin fire report (uses ALL active sessions)
router.post('/report', adminAuth, async (req, res) => {
  try {
    const { target } = req.body;
    if (!target) return res.status(400).json({ error: 'Target required' });

    const result = await fireReport(target);

    db.prepare(`INSERT INTO report_logs (triggered_by, target_number, sessions_used, success) VALUES (?,?,?,?)`)
      .run(null, target.replace(/\D/g, ''), result.total, result.success);

    res.json({ success: true, sessionsUsed: result.total, successCount: result.success });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Report logs
router.get('/logs', adminAuth, (req, res) => {
  const logs = db.prepare(`
    SELECT r.*, u.unique_id as triggered_by_id
    FROM report_logs r
    LEFT JOIN users u ON u.id = r.triggered_by
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all();
  res.json({ logs });
});

module.exports = router;
