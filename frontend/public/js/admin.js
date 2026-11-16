const API = '';
let adminToken = localStorage.getItem('war_admin_token');

window.onload = () => {
  if (adminToken) showAdminDashboard();
};

async function adminLogin() {
  const password = document.getElementById('admin-pass').value;
  const err = document.getElementById('admin-login-error');
  err.textContent = '';

  const res = await fetch(`${API}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await res.json();

  if (!res.ok) return err.textContent = data.error;

  adminToken = data.token;
  localStorage.setItem('war_admin_token', adminToken);
  showAdminDashboard();
}

function adminLogout() {
  localStorage.removeItem('war_admin_token');
  adminToken = null;
  document.getElementById('admin-dashboard-page').classList.add('hidden');
  document.getElementById('admin-dashboard-page').classList.remove('active');
  document.getElementById('admin-login-page').classList.remove('hidden');
  document.getElementById('admin-login-page').classList.add('active');
}

function showAdminDashboard() {
  document.getElementById('admin-login-page').classList.remove('active');
  document.getElementById('admin-login-page').classList.add('hidden');
  document.getElementById('admin-dashboard-page').classList.remove('hidden');
  document.getElementById('admin-dashboard-page').classList.add('active');
  loadStats();
  loadUsers();
  loadLogs();
}

async function loadStats() {
  const res = await fetch(`${API}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!res.ok) return adminLogout();
  const data = await res.json();
  document.getElementById('a-total-users').textContent = data.totalUsers;
  document.getElementById('a-active-sessions').textContent = data.activeSessions;
  document.getElementById('a-total-sessions').textContent = data.totalSessions;
  document.getElementById('a-total-reports').textContent = data.totalReports;
}

async function loadUsers() {
  const res = await fetch(`${API}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  const tbody = document.getElementById('users-tbody');
  if (!data.users?.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#555;padding:24px;">No users yet</td></tr>`;
    return;
  }
  tbody.innerHTML = data.users.map(u => `
    <tr>
      <td><span style="color:#ff4444;letter-spacing:2px;">${u.unique_id}</span></td>
      <td>${u.phone}</td>
      <td>${u.session_count}</td>
      <td>
        <span class="tbadge ${u.active_sessions > 0 ? 'tbadge-green' : 'tbadge-red'}">
          ${u.active_sessions}
        </span>
      </td>
      <td>${new Date(u.created_at).toLocaleDateString()}</td>
      <td><button class="btn-del" onclick="deleteUser(${u.id})">🗑️</button></td>
    </tr>
  `).join('');
}

async function deleteUser(id) {
  if (!confirm('Delete this user and all their sessions?')) return;
  await fetch(`${API}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  loadUsers();
  loadStats();
}

async function loadLogs() {
  const res = await fetch(`${API}/api/admin/logs`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const data = await res.json();
  const tbody = document.getElementById('logs-tbody');
  if (!data.logs?.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#555;padding:24px;">No bans fired yet</td></tr>`;
    return;
  }
  tbody.innerHTML = data.logs.map(l => `
    <tr>
      <td style="color:#ff4444;">+${l.target_number}</td>
      <td>${l.triggered_by_id || 'ADMIN'}</td>
      <td>${l.sessions_used}</td>
      <td>
        <span class="tbadge ${l.success > 0 ? 'tbadge-green' : 'tbadge-red'}">
          ${l.success}/${l.sessions_used}
        </span>
      </td>
      <td>${new Date(l.created_at).toLocaleString()}</td>
    </tr>
  `).join('');
}

async function adminFireReport() {
  const target = document.getElementById('admin-target').value.trim();
  const result = document.getElementById('admin-report-result');

  if (!target) {
    result.className = 'report-result error';
    result.textContent = '☠️ Enter a target number';
    result.classList.remove('hidden');
    return;
  }

  result.className = 'report-result';
  result.textContent = '⚡ Firing from all sessions...';
  result.classList.remove('hidden');

  const res = await fetch(`${API}/api/admin/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ target })
  });
  const data = await res.json();

  if (!res.ok) {
    result.className = 'report-result error';
    result.textContent = '❌ ' + data.error;
  } else {
    result.className = 'report-result success';
    result.textContent = `☠️ FIRED — ${data.sessionsUsed} sessions used, ${data.successCount} successful`;
    loadStats();
    loadLogs();
  }
}
