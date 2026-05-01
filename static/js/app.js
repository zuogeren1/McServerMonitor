// ---- State ----
const socket = io();
const RANGE_SECONDS = { '15m': 900, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800, '30d': 2592000 };
let currentPage = 'home';
let currentStatuses = [];
let detailServerId = null;
let prevPage = 'home';
let historyChart = null;
let historyData = [];
let chartCurrentRange = '15m';
let chartLastTs = 0;
let pinnedPoint = null;

// ---- Sidebar ----
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
let sidebarOpen = true;

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  sidebar.classList.toggle('collapsed', !sidebarOpen);
  localStorage.setItem('sidebar', sidebarOpen ? 'open' : 'closed');
}
sidebarToggle.addEventListener('click', toggleSidebar);
if (localStorage.getItem('sidebar') === 'closed') { sidebarOpen = true; toggleSidebar(); }

// ---- Navigation ----
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => switchPage(item.dataset.page));
});

function switchPage(page) {
  currentPage = page;
  if (!['detail', 'player-detail'].includes(page)) prevPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');
  document.getElementById(`page-${page}`).classList.add('active');
  if (page === 'detail' && detailServerId) {
    loadDetailPage(detailServerId);
  } else if (page === 'players') {
    loadPlayerList();
  } else {
    renderAll();
  }
}

// ---- Render All ----
function renderAll() {
  if (currentPage === 'home') renderHome();
  else if (currentPage === 'servers') renderServers();
  else if (currentPage === 'admin') renderAdmin();
}

// ---- Home ----
function renderHome() {
  const total = currentStatuses.length;
  const online = currentStatuses.filter(s => s.online).length;
  document.getElementById('totalServers').textContent = total;
  document.getElementById('onlineServers').textContent = online;
  document.getElementById('homeEmpty').style.display = total === 0 ? 'block' : 'none';

  const grid = document.getElementById('homeCards');
  if (total === 0) { grid.innerHTML = ''; return; }

  grid.innerHTML = currentStatuses.map(s => `
    <div class="server-card" onclick="openDetail(${s.server_id})">
      <div class="card-top">
        <div>
          <div class="card-name">${esc(s.server_name)}</div>
          <div class="card-addr">${fmtAddr(s.active_host, s.active_port)}</div>
        </div>
        <span class="status-tag ${s.online ? 'online' : 'offline'}">${s.online ? '在线' : '离线'}</span>
      </div>
      <div class="card-info">
        <div class="info-item">
          <div class="info-label">延迟</div>
          <div class="info-val">${s.latency != null ? s.latency + ' ms' : '--'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">版本</div>
          <div class="info-val">${s.version || '--'}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ---- Servers ----
function renderServers() {
  const total = currentStatuses.length;
  document.getElementById('serversEmpty').style.display = total === 0 ? 'block' : 'none';
  const grid = document.getElementById('serverCards');
  if (total === 0) { grid.innerHTML = ''; return; }

  grid.innerHTML = currentStatuses.map(s => `
    <div class="server-card" onclick="openDetail(${s.server_id})">
      <div class="card-top">
        <div>
          <div class="card-name">${esc(s.server_name)}</div>
          <div class="card-addr">${fmtAddr(s.active_host, s.active_port)}</div>
        </div>
        <span class="status-tag ${s.online ? 'online' : 'offline'}">${s.online ? '在线' : '离线'}</span>
      </div>
      <div class="card-info">
        <div class="info-item">
          <div class="info-label">延迟</div>
          <div class="info-val">${s.latency != null ? s.latency + ' ms' : '--'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">版本</div>
          <div class="info-val">${s.version || '--'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">玩家</div>
          <div class="info-val">${s.players.online} / ${s.players.max}</div>
        </div>
      </div>
      ${s.motd_html ? `<div style="font-size:0.8rem;margin-top:0.6rem;font-family:'Consolas','Courier New',monospace;white-space:pre-wrap;word-break:break-word;">${s.motd_html}</div>` : (s.motd ? `<div style="color:var(--muted);font-size:0.8rem;margin-top:0.6rem;font-family:'Consolas','Courier New',monospace;white-space:pre-wrap;word-break:break-word;">${esc(s.motd)}</div>` : '')}
    </div>
  `).join('');
}

// ---- Detail Page ----
function openDetail(sid) {
  detailServerId = sid;
  prevPage = currentPage;
  currentPage = 'detail';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-detail').classList.add('active');
  pinnedPoint = null;
  document.getElementById('pinnedSection').classList.remove('visible');
  loadDetailPage(sid);
  loadHistoryChart(sid, '15m');
}

function goBackFromDetail() {
  detailServerId = null;
  if (historyChart) { historyChart.destroy(); historyChart = null; }
  switchPage(prevPage || 'home');
}

function destroyChart() {
  if (historyChart) { historyChart.destroy(); historyChart = null; }
}

function loadDetailPage(sid) {
  const s = currentStatuses.find(x => x.server_id === sid);
  if (!s) return;

  document.getElementById('detailTitle').textContent = s.server_name;
  document.getElementById('detailAddr').textContent = fmtAddr(s.active_host, s.active_port);
  const tag = document.getElementById('detailStatusTag');
  tag.textContent = s.online ? '在线' : '离线';
  tag.className = 'status-tag ' + (s.online ? 'online' : 'offline');

  document.getElementById('dVersion').textContent = s.version || '--';
  document.getElementById('dProtocol').textContent = s.protocol || '--';
  document.getElementById('dLatency').textContent = s.latency != null ? s.latency + ' ms' : '--';
  document.getElementById('dPlayers').textContent = s.players.online + ' / ' + s.players.max;
  document.getElementById('dMotd').innerHTML = s.motd_html || esc(s.motd) || '--';

  const playerList = s.players.list || [];
  const plEl = document.getElementById('dPlayerList');
  const plEmpty = document.getElementById('dPlayerEmpty');
  if (playerList.length === 0) {
    plEl.innerHTML = '';
    plEmpty.style.display = 'block';
  } else {
    plEmpty.style.display = 'none';
    plEl.innerHTML = playerList.map(p => `
      <div class="player-chip" onclick="onPlayerClick('${esc(p.name)}', '${p.id || p.name}')" title="点击查看玩家详情 (开发中)">
        <img src="${avatarUrl(p.id, p.name)}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Crect width=%2220%22 height=%2220%22 fill=%22%23475569%22/%3E%3C/svg%3E'">
        <span>${esc(p.name)}</span>
      </div>
    `).join('');
  }

  const backups = s.backup_statuses || [];
  const bkEl = document.getElementById('dBackupList');
  const bkEmpty = document.getElementById('dBackupEmpty');
  if (backups.length === 0) {
    bkEl.innerHTML = '';
    bkEmpty.style.display = 'block';
  } else {
    bkEmpty.style.display = 'none';
    bkEl.innerHTML = backups.map(b => `
      <div class="backup-status-row">
        <span>
          <span class="backup-status-dot ${b.online ? 'green' : 'red'}"></span>
          <span style="font-size:0.75rem;color:var(--muted);">${b.type === 'primary' ? '主地址' : '副地址'}</span>
        </span>
        <span class="addr">${fmtAddr(b.host, b.port)}</span>
        <span style="color:${b.online ? 'var(--online)' : 'var(--offline)'};font-size:0.8rem;">
          ${b.online ? (b.latency ? b.latency + 'ms' : '在线') : '离线'}
        </span>
      </div>
    `).join('');
  }
}

function onPlayerClick(name, uuid) {
  openPlayerDetail(uuid || name);
}

// ---- Admin Page ----
let editingServerId = null;

function renderAdmin() {
  fetch('/api/config').then(r => r.json()).then(c => {
    document.getElementById('intervalInput').value = c.check_interval;
  });
  fetch('/api/servers').then(r => r.json()).then(servers => {
    const list = document.getElementById('adminServerList');
    if (servers.length === 0) {
      list.innerHTML = '<div style="color:var(--muted);">暂无服务器</div>';
      return;
    }
    list.innerHTML = servers.map(s => `
      <div class="item">
        <div class="info">
          <strong>${esc(s.name)}</strong>
          <small style="color:var(--muted);margin-left:0.5rem;">${fmtAddr(s.primary_host, s.primary_port)}</small>
          ${s.backups.length > 0 ? `<small style="color:var(--muted);"> +${s.backups.length} 副地址</small>` : ''}
        </div>
        <div style="display:flex;gap:0.4rem;">
          <button class="btn btn-outline btn-sm" onclick="editServer(${s.id})">
            <svg class="svg-icon sm"><use href="#icon-edit"/></svg>
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteServer(${s.id})">
            <svg class="svg-icon sm"><use href="#icon-close"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  });
}

document.getElementById('saveInterval').addEventListener('click', () => {
  const val = parseInt(document.getElementById('intervalInput').value) || 5;
  fetch('/api/config', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({check_interval: val})
  });
});

document.getElementById('addBackupBtn').addEventListener('click', () => {
  const container = document.getElementById('backupList');
  const idx = container.children.length + 1;
  const div = document.createElement('div');
  div.className = 'backup-row';
  div.innerHTML = `
    <span class="idx">#${idx}</span>
    <input type="text" placeholder="mc.example.com 或 IP:端口" class="bkp-addr" style="flex:1;">
    <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove();reindexBackups();">
      <svg class="svg-icon sm"><use href="#icon-close"/></svg>
    </button>
  `;
  container.appendChild(div);
});

function reindexBackups() {
  document.querySelectorAll('#backupList .backup-row .idx').forEach((el, i) => el.textContent = '#' + (i+1));
}

function getBackups() {
  return Array.from(document.querySelectorAll('#backupList .backup-row'))
    .map(r => r.querySelector('.bkp-addr').value.trim()).filter(v => v);
}

document.getElementById('saveServer').addEventListener('click', () => {
  const name = document.getElementById('srvName').value.trim();
  const addr = document.getElementById('srvAddr').value.trim();
  if (!name || !addr) { alert('请填写服务器名称和主地址'); return;
  }

  const data = { name, primary_address: addr, backups: getBackups() };
  const isEdit = !!editingServerId;
  const url = isEdit ? `/api/servers/${editingServerId}` : '/api/servers';
  const method = isEdit ? 'PUT' : 'POST';

  fetch(url, {
    method, headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  }).then(r => r.json()).then(() => { resetForm(); renderAdmin(); });
});

document.getElementById('cancelEdit').addEventListener('click', resetForm);

function resetForm() {
  editingServerId = null;
  document.getElementById('editServerId').value = '';
  document.getElementById('srvName').value = '';
  document.getElementById('srvAddr').value = '';
  document.getElementById('backupList').innerHTML = '';
  document.getElementById('formTitle').innerHTML = '<svg class="svg-icon"><use href="#icon-plus"/></svg> 添加服务器';
  document.getElementById('cancelEdit').style.display = 'none';
  document.getElementById('saveServer').innerHTML = '<svg class="svg-icon sm"><use href="#icon-check"/></svg> 保存服务器';
}

function editServer(sid) {
  fetch('/api/servers').then(r => r.json()).then(servers => {
    const s = servers.find(x => x.id === sid);
    if (!s) return;
    editingServerId = sid;
    document.getElementById('editServerId').value = sid;
    document.getElementById('srvName').value = s.name;
    document.getElementById('srvAddr').value = s.primary_port != null ? s.primary_host + ':' + s.primary_port : s.primary_host;
    document.getElementById('formTitle').innerHTML = '<svg class="svg-icon"><use href="#icon-edit"/></svg> 编辑服务器';
    document.getElementById('cancelEdit').style.display = '';
    document.getElementById('saveServer').innerHTML = '<svg class="svg-icon sm"><use href="#icon-check"/></svg> 更新服务器';

    const container = document.getElementById('backupList');
    container.innerHTML = '';
    s.backups.forEach((b, i) => {
      const div = document.createElement('div');
      div.className = 'backup-row';
      div.innerHTML = `
        <span class="idx">#${i+1}</span>
        <input type="text" value="${esc(b.port != null ? b.host + ':' + b.port : b.host)}" class="bkp-addr" style="flex:1;">
        <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove();reindexBackups();">
          <svg class="svg-icon sm"><use href="#icon-close"/></svg>
        </button>
      `;
      container.appendChild(div);
    });
    switchPage('admin');
  });
}

function deleteServer(sid) {
  if (!confirm('确定删除此服务器?')) return;
  fetch(`/api/servers/${sid}`, {method: 'DELETE'}).then(() => renderAdmin());
}

// ---- WebSocket ----
socket.on('status_update', (data) => {
  currentStatuses = data;
  renderAll();
  if (currentPage === 'detail' && detailServerId) loadDetailPage(detailServerId);
  if (currentPage === 'players') loadPlayerList();
  if (currentPage === 'player-detail' && playerDetailUuid) loadPlayerDetail(playerDetailUuid);
});

// ---- Helpers ----
function fmtAddr(host, port) {
  if (port == null) return esc(host);
  return esc(host) + ':' + port;
}
function avatarUrl(uuid, name) {
  const id = uuid || name;
  if (!id) return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Crect width=%2220%22 height=%2220%22 fill=%22%23475569%22/%3E%3C/svg%3E';
  return `https://crafthead.net/avatar/${encodeURIComponent(id)}`;
}
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initial config load
fetch('/api/config').then(r => r.json()).then(c => {
  document.getElementById('intervalInput').value = c.check_interval;
});
