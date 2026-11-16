const API = '';
let token = localStorage.getItem('war_token');
let socket = null;

// ===== INIT =====
window.onload = () => {
  if (token) showDashboard();
};

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.form-block').forEach(f => f.classList.add('hidden'));
  if (tab === 'login') {
    document.querySelectorAll('.tab')[0].classList.add('active');
    document.getElementById('login-form').classList.remove('hidden');
  } else {
    document.querySelectorAll('.tab')[1].classList.add('active');
    document.getElementById('register-form').classList.remove('hidden');
  }
}

// ===== AUTH =====
async function register() {
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-pass').value;
  const err = document.getElementById('reg-error');
  err.textContent = '';

  const res = await fetch(`${API}/api/user/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });
  const data = await res.json();

  if (!res.ok) return err.textContent = data.error;

  document.getElementById('user-unique-id').textContent = data.uniqueId;
  document.getElementById('reg-success').classList.remove('hidden');
}

async function login() {
  const phone = document.getElementById('login-phone').value.trim();
  const password = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  err.textContent = '';

  const res = await fetch(`${API}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });
  const data = await res.json();

  if (!res.ok) return err.textContent = data.error;

  token = data.token;
  localStorage.setItem('war_token', token);
  localStorage.setItem('war_uid', data.uniqueId);
  showDashboard();
}

function logout() {
  localStorage.removeItem('war_token');
  localStorage.removeItem('war_uid');
  token = null;
  if (socket) socket.disconnect();
  document.getElementById('dashboard-page').classList.add('hidden');
  document.getElementById('dashboard-page').classList.remove('active');
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('auth-page').classList.add('active');
}

// ===== DASHBOARD =====
function showDashboard() {
  document.getElementById('auth-page').classList.remove('active');
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('dashboard-page').classList.remove('hidden');
  document.getElementById('dashboard-page').classList.add('active');

  const uid = localStorage.getItem('war_uid') || '';
  document.getElementById('nav-uid').textContent = `ID: ${uid}`;

  initSocket();
  loadDashboard();
}

async function loadDashboard() {
  const res = await fetch(`${API}/api/user/dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return logout();
  const data = await res.json();

  renderSessions(data.sessions);
  document.getElementById('stat-reports').textContent = data.totalReports;
}

function renderSessions(sessions) {
  const list = document.getElementById('sessions-list');
  const warning = document.getElementById('sessions-warning');
  const activeCount = sessions.filter(s => s.status === 'active').length;

  document.getElementById('stat-total').textContent = sessions.length;
  document.getElementById('stat-active').textContent = activeCount;

  if (!sessions.length) {
    list.innerHTML = `<div class="empty-sessions"><span>💀</span><p>No accounts paired yet</p><p class="es-sub">Pair at least 2 accounts to activate the network</p></div>`;
  } else {
    list.innerHTML = sessions.map(s => `
      <div class="session-item" id="sess-${s.session_id}">
        <div class="si-left">
          <div class="status-dot ${s.status}"></div>
          <div>
            <div class="si-phone">${formatPhone(s.phone)}</div>
            <div class="si-status">${s.status}</div>
          </div>
        </div>
        <button class="btn-remove" onclick="removeSession('${s.session_id}')">✕</button>
      </div>
    `).join('');
  }

  if (activeCount < 2) {
    warning.classList.remove('hidden');
    document.getElementById('sessions-warning-text').textContent =
      `⚠️ You need ${2 - activeCount} more active account${activeCount === 1 ? '' : 's'} to use the report network`;
  } else {
    warning.classList.add('hidden');
  }
}

function formatPhone(phone) {
  if (!phone) return 'Unknown';
  return '+' + phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
}

async function removeSession(sessionId) {
  if (!confirm('Remove this paired account?')) return;
  await fetch(`${API}/api/user/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  loadDashboard();
}

// ===== REPORT =====
async function fireReport() {
  const target = document.getElementById('target-number').value.trim();
  const result = document.getElementById('report-result');
  const btn = document.getElementById('report-btn');

  if (!target) {
    showResult(result, 'error', '☠️ Enter a target number first');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⚡ FIRING...';
  result.classList.add('hidden');

  const res = await fetch(`${API}/api/user/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ target })
  });
  const data = await res.json();

  btn.disabled = false;
  btn.textContent = '💀 BAN THIS NUMBER';

  if (!res.ok) {
    showResult(result, 'error', '❌ ' + data.error);
  } else {
    showResult(result, 'success', `☠️ REPORT SENT — ${data.sessionsUsed} sessions fired, ${data.successCount} successful`);
    loadDashboard();
  }
}

function showResult(el, type, msg) {
  el.className = `report-result ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ===== PAIRING =====
let pairingSessionId = null;

function showPairModal() {
  document.getElementById('pair-modal').classList.remove('hidden');
  document.getElementById('pair-step-1').classList.remove('hidden');
  document.getElementById('pair-step-2').classList.add('hidden');
  document.getElementById('pair-step-3').classList.add('hidden');
  document.getElementById('pair-phone').value = '';
  document.getElementById('pair-error').textContent = '';
}

function closePairModal() {
  document.getElementById('pair-modal').classList.add('hidden');
  pairingSessionId = null;
  loadDashboard();
}

async function requestPairing() {
  const phone = document.getElementById('pair-phone').value.trim();
  const err = document.getElementById('pair-error');
  err.textContent = '';

  if (!phone) return err.textContent = 'Enter a phone number';

  const res = await fetch(`${API}/api/user/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ phone })
  });
  const data = await res.json();

  if (!res.ok) return err.textContent = data.error;

  pairingSessionId = data.sessionId;
  document.getElementById('pairing-code').textContent = data.code;
  document.getElementById('pair-step-1').classList.add('hidden');
  document.getElementById('pair-step-2').classList.remove('hidden');
}

// ===== SOCKET =====
function initSocket() {
  socket = io();
  socket.on('session_status', ({ sessionId, status }) => {
    // update dot in real time
    const item = document.getElementById(`sess-${sessionId}`);
    if (item) {
      const dot = item.querySelector('.status-dot');
      const label = item.querySelector('.si-status');
      if (dot) dot.className = `status-dot ${status}`;
      if (label) label.textContent = status;
    }

    // if our pairing session just went active
    if (pairingSessionId && sessionId === pairingSessionId && status === 'active') {
      document.getElementById('pair-step-2').classList.add('hidden');
      document.getElementById('pair-step-3').classList.remove('hidden');
      setTimeout(closePairModal, 2000);
    }

    loadDashboard();
  });
}
