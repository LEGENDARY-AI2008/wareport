const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { userAuth } = require('../middleware/auth');
const { createPairingSession, loadSession } = require('../sessions/sessionManager');

const JWT_SECRET = process.env.JWT_SECRET || 'wareport_secret_key_change_this';

// Register
router.post('/register', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) return res.status(400).json({ error: 'Invalid phone number' });

    const uniqueId = cleanPhone.slice(-5);
    const existing = db.prepare(`SELECT id FROM users WHERE phone=? OR unique_id=?`).get(cleanPhone, uniqueId);
    if (existing) return res.status(400).json({ error: 'Phone already registered' });

    const hash = await bcrypt.hash(password, 10);
    db.prepare(`INSERT INTO users (phone, unique_id, password_hash) VALUES (?,?,?)`).run(cleanPhone, uniqueId, hash);

    res.json({ success: true, uniqueId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const cleanPhone = phone.replace(/\D/g, '');
    const user = db.prepare(`SELECT * FROM users WHERE phone=?`).get(cleanPhone);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, phone: user.phone, uniqueId: user.unique_id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, uniqueId: user.unique_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get my sessions
router.get('/sessions', userAuth, (req, res) => {
  const sessions = db.prepare(`SELECT session_id, phone, status, paired_at FROM sessions WHERE user_id=?`).all(req.user.id);
  res.json({ sessions });
});

// Pair new account
router.post('/pair', userAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const cleanPhone = phone.replace(/\D/g, '');
    const existing = db.prepare(`SELECT id FROM sessions WHERE user_id=? AND phone=?`).get(req.user.id, cleanPhone);
    if (existing) return res.status(400).json({ error: 'Account already paired' });

    const count = db.prepare(`SELECT COUNT(*) as c FROM sessions WHERE user_id=?`).get(req.user.id);
    if (count.c >= 5) return res.status(400).json({ error: 'Maximum 5 accounts per user' });

    const sessionId = `user_${req.user.id}_${Date.now()}`;

    // Insert as pending
    db.prepare(`INSERT INTO sessions (user_id, session_id, phone, status) VALUES (?,?,?,?)`).run(req.user.id, sessionId, cleanPhone, 'pairing');

    // Start pairing — this resolves with the code
    const code = await createPairingSession(sessionId, cleanPhone);

    res.json({ code, sessionId });
  } catch (e) {
    console.error('[PAIR ERROR]', e.message);
    res.status(500).json({ error: 'Pairing failed: ' + e.message });
  }
});

// Remove a session
router.delete('/sessions/:sessionId', userAuth, (req, res) => {
  const { sessionId } = req.params;
  db.prepare(`DELETE FROM sessions WHERE session_id=? AND user_id=?`).run(sessionId, req.user.id);
  res.json({ success: true });
});

// Fire report
router.post('/report', userAuth, async (req, res) => {
  try {
    const { target } = req.body;
    if (!target) return res.status(400).json({ error: 'Target number required' });

    const activeSessions = db.prepare(`SELECT COUNT(*) as c FROM sessions WHERE user_id=? AND status='active'`).get(req.user.id);
    if (activeSessions.c < 2) {
      return res.status(400).json({ error: `You need at least 2 active paired accounts. You have ${activeSessions.c}.` });
    }

    const { fireReport } = require('../sessions/sessionManager');
    const result = await fireReport(target);

    db.prepare(`INSERT INTO report_logs (triggered_by, target_number, sessions_used, success) VALUES (?,?,?,?)`)
      .run(req.user.id, target.replace(/\D/g, ''), result.total, result.success);

    res.json({ success: true, sessionsUsed: result.total, successCount: result.success });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dashboard stats
router.get('/dashboard', userAuth, (req, res) => {
  const sessions = db.prepare(`SELECT session_id, phone, status, paired_at FROM sessions WHERE user_id=?`).all(req.user.id);
  const reports = db.prepare(`SELECT COUNT(*) as c FROM report_logs WHERE triggered_by=?`).get(req.user.id);
  const user = db.prepare(`SELECT phone, unique_id, created_at FROM users WHERE id=?`).get(req.user.id);
  res.json({ sessions, totalReports: reports.c, user });
});

module.exports = router;
