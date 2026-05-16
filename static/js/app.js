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
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
let sidebarOpen = true;
const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

function closeMobileSidebar() {
  sidebar.classList.remove('mobile-open');
  sidebarOverlay.classList.remove('visible');
}

function openMobileSidebar() {
  sidebar.classList.add('mobile-open');
  sidebarOverlay.classList.add('visible');
}

function toggleSidebar() {
  if (isMobile()) {
    if (sidebar.classList.contains('mobile-open')) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
    return;
  }
  // Desktop: collapse/expand
  sidebarOpen = !sidebarOpen;
  sidebar.classList.toggle('collapsed', !sidebarOpen);
  localStorage.setItem('sidebar', sidebarOpen ? 'open' : 'closed');
}

sidebarToggle.addEventListener('click', toggleSidebar);
mobileMenuBtn.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', closeMobileSidebar);

// Close mobile sidebar on nav item click
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    switchPage(item.dataset.page);
    if (isMobile()) closeMobileSidebar();
  });
});

// Init desktop sidebar state (not on mobile)
if (!isMobile() && localStorage.getItem('sidebar') === 'closed') {
  sidebarOpen = true;
  toggleSidebar();
}

// Reset sidebar state on window resize
window.addEventListener('resize', () => {
  if (!isMobile()) {
    closeMobileSidebar();
    // Restore desktop sidebar state
    if (localStorage.getItem('sidebar') === 'closed') {
      sidebar.classList.add('collapsed');
      sidebarOpen = false;
    } else {
      sidebar.classList.remove('collapsed');
      sidebarOpen = true;
    }
  }
});

// ---- Theme ----
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.querySelector('use').setAttribute('href', theme === 'light' ? '#icon-theme-dark' : '#icon-theme-light');
  localStorage.setItem('theme', theme);
}
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(current === 'dark' ? 'light' : 'dark');
});
if (localStorage.getItem('theme') === 'light') setTheme('light');

// ---- Navigation ----
let loggedIn = false;
let _requireLoginEnabled = false;  // 由服务端 config 决定

function _requireLogin(page) {
  if (loggedIn || !_requireLoginEnabled) { switchPageDirect(page); return; }
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  _pendingLoginPage = page;
}
let _pendingLoginPage = null;

function switchPageDirect(page) {
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

function switchPage(page) {
  if (['admin', 'player-manage'].includes(page)) {
    _requireLogin(page);
  } else {
    switchPageDirect(page);
  }
}

// ---- Render All ----
function renderAll() {
  if (currentPage === 'home') renderHome();
  else if (currentPage === 'servers') renderServers();
  else if (currentPage === 'admin') renderAdmin();
  else if (currentPage === 'player-manage') renderPlayerManage();
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
          <div class="card-name">${esc(s.server_name)} <span class="type-badge type-${s.server_type || 'java'}">${s.server_type === 'bedrock' ? '基岩' : 'Java'}</span></div>
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
          <div class="card-name">${esc(s.server_name)} <span class="type-badge type-${s.server_type || 'java'}">${s.server_type === 'bedrock' ? '基岩' : 'Java'}</span></div>
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

function _setHtmlIfChanged(el, html) {
  if (el._lastHtml !== html) { el._lastHtml = html; el.innerHTML = html; }
}

function _hasSelectionIn(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return false;
  for (let i = 0; i < sel.rangeCount; i++) {
    const r = sel.getRangeAt(i);
    if (el.contains(r.startContainer) || el.contains(r.endContainer)) return true;
  }
  return false;
}

function _setHtmlSafe(el, html) {
  if (_hasSelectionIn(el)) return;  // 用户正在选中文字，跳过更新
  _setHtmlIfChanged(el, html);
}

function _setTextSafe(el, text) {
  if (_hasSelectionIn(el)) return;
  if (el._lastText !== text) { el._lastText = text; el.textContent = text; }
}

function loadDetailPage(sid) {
  const s = currentStatuses.find(x => x.server_id === sid);
  if (!s) return;

  updatePlayerNotifBtn(sid);
  document.getElementById('detailTitle').innerHTML = esc(s.server_name) + ' <span class="type-badge type-' + (s.server_type || 'java') + '">' + (s.server_type === 'bedrock' ? '基岩' : 'Java') + '</span>';
  document.getElementById('detailAddr').textContent = fmtAddr(s.active_host, s.active_port);
  const tag = document.getElementById('detailStatusTag');
  tag.textContent = s.online ? '在线' : '离线';
  tag.className = 'status-tag ' + (s.online ? 'online' : 'offline');

  document.getElementById('dVersion').textContent = s.version || '--';
  document.getElementById('dProtocol').textContent = s.protocol || '--';
  _setTextSafe(document.getElementById('dLatency'), s.latency != null ? s.latency + ' ms' : '--');
  _setTextSafe(document.getElementById('dPlayers'), s.players.online + ' / ' + s.players.max);
  document.getElementById('dMotd').innerHTML = s.motd_html || esc(s.motd) || '--';

  const bedrockInfo = document.getElementById('dBedrockInfo');
  if (s.server_type === 'bedrock' && s.online) {
    bedrockInfo.style.display = '';
    _setTextSafe(document.getElementById('dBedrockMap'), s.map_name || '--');
    _setTextSafe(document.getElementById('dBedrockGamemode'), s.gamemode || '--');
    _setTextSafe(document.getElementById('dBedrockBrand'), s.brand || '--');
  } else {
    bedrockInfo.style.display = 'none';
  }

  const playerList = s.players.list || [];
  const plEl = document.getElementById('dPlayerList');
  const plEmpty = document.getElementById('dPlayerEmpty');
  // 合并匿名玩家
  const anonCount = playerList.filter(p => (p.name || '').includes(' ')).length;
  const normalPlayers = playerList.filter(p => !(p.name || '').includes(' '));
  if (normalPlayers.length === 0 && anonCount === 0) {
    _setHtmlSafe(plEl, '');
    plEmpty.style.display = 'block';
  } else {
    plEmpty.style.display = 'none';
    const chips = normalPlayers.map(p => `
      <div class="player-chip" onclick="onPlayerClick('${esc(p.name)}')" title="点击查看玩家详情">
        <img src="${avatarUrl(p.id, p.name)}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Crect width=%2220%22 height=%2220%22 fill=%22%23475569%22/%3E%3C/svg%3E'">
        <span>${esc(p.name)}</span>
      </div>
    `);
    if (anonCount > 0) {
      chips.push(`
        <div class="player-chip" onclick="onPlayerClick('Anonymous Player')" title="点击查看匿名玩家详情" style="opacity:0.7;">
          <span>Anonymous Player x${anonCount}</span>
        </div>
      `);
    }
    // 服务端随机报告最多 12 位玩家，超出时提示还有多少人
    const totalOnline = s.players.online;
    const sampleTotal = playerList.length;
    const hiddenCount = totalOnline - sampleTotal;
    if (hiddenCount > 0) {
      chips.push(`
        <span class="player-chip" style="opacity:0.5;cursor:default;background:transparent;border:1px dashed var(--border);">
          还有 ${hiddenCount} 位玩家
        </span>
      `);
    }
    _setHtmlSafe(plEl, chips.join(''));
  }

  const backups = s.backup_statuses || [];
  const bkEl = document.getElementById('dBackupList');
  const bkEmpty = document.getElementById('dBackupEmpty');
  if (backups.length === 0) {
    _setHtmlSafe(bkEl, '');
    bkEmpty.style.display = 'block';
  } else {
    bkEmpty.style.display = 'none';
    _setHtmlSafe(bkEl, backups.map(b => `
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
    `).join(''));
  }
}

function onPlayerClick(name) {
  openPlayerDetail(name);
}

// ---- Admin Page ----
let editingServerId = null;

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

  const srvType = document.querySelector('input[name="srvType"]:checked').value;
  const data = { name, primary_address: addr, backups: getBackups(), server_type: srvType };
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
  const javaRadio = document.querySelector('input[name="srvType"][value="java"]');
  if (javaRadio) javaRadio.checked = true;
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
    const typeRadio = document.querySelector('input[name="srvType"][value="' + (s.server_type || 'java') + '"]');
    if (typeRadio) typeRadio.checked = true;
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

// ---- Login Modal ----
document.getElementById('loginSubmit').addEventListener('click', async () => {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const resp = await fetch('/api/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username, password}),
  });
  if (resp.ok) {
    loggedIn = true;
    document.getElementById('loginOverlay').style.display = 'none';
    if (_pendingLoginPage) switchPageDirect(_pendingLoginPage);
  } else {
    const data = await resp.json();
    document.getElementById('loginError').textContent = data.error || '登录失败';
    document.getElementById('loginError').style.display = 'block';
  }
});

document.getElementById('loginCancel').addEventListener('click', () => {
  document.getElementById('loginOverlay').style.display = 'none';
  _pendingLoginPage = null;
});

// Enter key in password field submits login
document.getElementById('loginPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('loginSubmit').click();
});

// ---- Admin Settings ----
function renderAdmin() {
  // Load config (username, check_interval)
  fetch('/api/config').then(r => r.json()).then(c => {
    document.getElementById('intervalInput').value = c.check_interval;
    document.getElementById('authUsername').value = c.username || '';
    document.getElementById('authPassword').value = '';
    document.getElementById('srvHost').value = c.host || '0.0.0.0';
    document.getElementById('srvPort').value = c.port || 9000;
    document.getElementById('dbPath').value = c.db_path || 'monitor.db';
    document.getElementById('offlineThreshold').value = c.offline_threshold || 2;
    _offlineThreshold = c.offline_threshold || 2;
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
          <span class="type-badge type-${s.server_type || 'java'}">${s.server_type === 'bedrock' ? '基岩' : 'Java'}</span>
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

document.getElementById('saveSettings').addEventListener('click', () => {
  const check_interval = parseInt(document.getElementById('intervalInput').value) || 5;
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const host = document.getElementById('srvHost').value.trim() || '0.0.0.0';
  const port = parseInt(document.getElementById('srvPort').value) || 9000;
  const db_path = document.getElementById('dbPath').value.trim() || 'monitor.db';
  const offline_threshold = parseInt(document.getElementById('offlineThreshold').value) || 2;
  _offlineThreshold = offline_threshold;
  fetch('/api/admin/config', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({check_interval, username, password, host, port, db_path, offline_threshold}),
  }).then(() => {
    document.getElementById('authPassword').value = '';
    alert('设置已保存。监听地址/端口/数据库路径需重启后生效');
  });
});

// Remove old saveInterval handler (replaced by saveSettings)
const oldSaveInterval = document.getElementById('saveInterval');
if (oldSaveInterval) oldSaveInterval.remove();

// ---- Player Manage Page ----
let adminPlayerList = [];

function renderPlayerManage() {
  _renderPlayerManageList();
}

function _renderPlayerManageList(filter) {
  if (!adminPlayerList.length || !filter) {
    fetch('/api/players').then(r => r.json()).then(players => {
      adminPlayerList = players;
      _doRenderPlayerManageList(filter);
    });
  } else {
    _doRenderPlayerManageList(filter);
  }
}

function _doRenderPlayerManageList(filter) {
  const list = document.getElementById('adminPlayerList');
  let players = adminPlayerList;
  if (filter) {
    const q = filter.toLowerCase();
    players = players.filter(p => p.name.toLowerCase().includes(q));
  }
  if (players.length === 0) {
    list.innerHTML = '<div style="color:var(--muted);">无匹配玩家</div>';
    return;
  }
  list.innerHTML = players.map(p => `
    <div class="item">
      <div class="info" style="display:flex;align-items:center;gap:0.4rem;overflow:hidden;">
        <img src="${avatarUrl(p.uuid, p.name)}" alt="" style="width:22px;height:22px;border-radius:3px;flex-shrink:0;" onerror="this.style.display='none'">
        <strong style="flex-shrink:0;">${esc(p.name)}</strong>
        <small style="color:var(--muted);font-family:'Consolas','Courier New',monospace;font-size:0.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.uuid || '')}</small>
        <small style="color:var(--muted);font-size:0.75rem;">${formatDuration(p.total_online_seconds)}</small>
      </div>
      <button class="btn btn-danger btn-sm" onclick="deleteAdminPlayer('${esc(p.name)}')">
        <svg class="svg-icon sm"><use href="#icon-close"/></svg>
      </button>
    </div>
  `).join('');
}

function deleteAdminPlayer(name) {
  if (!confirm(`确定删除玩家 "${name}" 及其所有数据?`)) return;
  fetch(`/api/players/${encodeURIComponent(name)}`, {method: 'DELETE'}).then(() => {
    adminPlayerList = [];
    _renderPlayerManageList(document.getElementById('playerSearch').value);
  });
}

document.getElementById('playerSearch').addEventListener('input', (e) => {
  _renderPlayerManageList(e.target.value);
});

// ---- Notifications ----
let serverNotifEnabled = localStorage.getItem('serverNotif') === 'true';
let playerNotifServers = JSON.parse(localStorage.getItem('playerNotifServers') || '{}');  // { server_id: true }
let prevStatuses = [];

function _ensureNotifPermission(cb) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(p => { if (p === 'granted' && cb) cb(); });
  } else if (Notification.permission === 'granted' && cb) {
    cb();
  }
}

function toggleServerNotif() {
  if (serverNotifEnabled) {
    serverNotifEnabled = false;
    localStorage.setItem('serverNotif', 'false');
  } else {
    _ensureNotifPermission(() => { serverNotifEnabled = true; localStorage.setItem('serverNotif', 'true'); updateServerNotifBtn(); });
  }
  updateServerNotifBtn();
}

function updateServerNotifBtn() {
  const btn = document.getElementById('notifToggle');
  if (btn) {
    btn.textContent = serverNotifEnabled ? '通知: 开' : '通知: 关';
    btn.className = 'btn btn-sm ' + (serverNotifEnabled ? 'btn-primary' : 'btn-outline');
  }
}

function togglePlayerNotif(sid) {
  if (playerNotifServers[sid]) {
    delete playerNotifServers[sid];
  } else {
    _ensureNotifPermission(() => {
      playerNotifServers[sid] = true;
      localStorage.setItem('playerNotifServers', JSON.stringify(playerNotifServers));
      updatePlayerNotifBtn(sid);
    });
  }
  localStorage.setItem('playerNotifServers', JSON.stringify(playerNotifServers));
  updatePlayerNotifBtn(sid);
}

function updatePlayerNotifBtn(sid) {
  const btn = document.getElementById('playerNotifBtn');
  if (btn) {
    const on = !!playerNotifServers[sid];
    btn.textContent = on ? '玩家通知: 开' : '玩家通知: 关';
    btn.className = 'btn btn-sm ' + (on ? 'btn-primary' : 'btn-outline');
  }
}

function _notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body }); } catch(e) {}
}

let _offlineCounts = {};       // server_id -> 连续离线次数
let _offlineNotified = {};     // server_id -> 是否已发过离线通知
let _offlineThreshold = 2;     // 由 config 更新

function checkNotifications(newData) {
  if (prevStatuses.length === 0) return;
  for (const s of newData) {
    const prev = prevStatuses.find(x => x.server_id === s.server_id);
    if (!prev) continue;

    // 服务器上下线通知（全局开关控制）
    if (serverNotifEnabled) {
      if (s.online && !prev.online) {
        _offlineCounts[s.server_id] = 0;
        if (_offlineNotified[s.server_id]) {
          _offlineNotified[s.server_id] = false;
          _notify(s.server_name, '服务器已上线');
        }
      }
      if (!s.online) {
        if (prev.online) _offlineCounts[s.server_id] = 1;
        else _offlineCounts[s.server_id] = (_offlineCounts[s.server_id] || 0) + 1;
        if (_offlineCounts[s.server_id] === _offlineThreshold) {
          _offlineNotified[s.server_id] = true;
          _notify(s.server_name, `服务器已离线（连续 ${_offlineThreshold} 次）`);
        }
      }
    }

    // 玩家加入/离开通知（按服务器开关控制，仅采样完整时生效）
    if (playerNotifServers[s.server_id] && s.online && prev.online && s.players.online <= 12) {
      const prevNames = new Set((prev.players.list || []).map(p => p.name));
      const currNames = new Set((s.players.list || []).map(p => p.name));
      for (const n of currNames) { if (!prevNames.has(n) && !n.includes(' ')) _notify(s.server_name, `${n} 加入了`); }
      for (const n of prevNames) { if (!currNames.has(n) && !n.includes(' ')) _notify(s.server_name, `${n} 离开了`); }
    }
  }
}

// ---- WebSocket ----
socket.on('status_update', (data) => {
  checkNotifications(data);
  prevStatuses = data;
  currentStatuses = data;
  renderAll();
  updateFavicon(data);
  if (currentPage === 'detail' && detailServerId) loadDetailPage(detailServerId);
  if (currentPage === 'players') loadPlayerList();
  if (currentPage === 'player-detail' && playerDetailName) loadPlayerDetail(playerDetailName);
});

// ---- Favicon Badge ----
function updateFavicon(statuses) {
  const canvas = document.getElementById('faviconCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = 64;
  ctx.clearRect(0, 0, size, size);

  // 背景方块
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(size - r, 0); ctx.arcTo(size, 0, size, r, r);
  ctx.lineTo(size, size - r); ctx.arcTo(size, size, size - r, size, r);
  ctx.lineTo(r, size); ctx.arcTo(0, size, 0, size - r, r);
  ctx.lineTo(0, r); ctx.arcTo(0, 0, r, 0, r);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();

  // MC 方块简单图案
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(16, 10, 32, 6);
  ctx.fillRect(16, 36, 32, 6);
  ctx.fillRect(16, 16, 6, 20);
  ctx.fillRect(42, 16, 6, 20);

  // 角标
  const total = statuses.length;
  const online = statuses.filter(s => s.online).length;
  const cx = 48, cy = 14, cr = 13;
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  if (total === 0) {
    ctx.fillStyle = '#555';
  } else if (online === total) {
    ctx.fillStyle = '#22c55e';
  } else if (online > 0) {
    ctx.fillStyle = '#f59e0b';
  } else {
    ctx.fillStyle = '#ef4444';
  }
  ctx.fill();
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 角标文字
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (total === 0) {
    ctx.fillText('0', cx, cy);
  } else if (online === total) {
    ctx.fillText(total, cx, cy);
  } else {
    ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(online, cx - 4, cy);
    ctx.fillText('/' + total, cx + 6, cy);
  }

  document.getElementById('favicon').href = canvas.toDataURL();
}

// ---- DB Optimize ----
function showOptimizeDialog() {
  const overlay = document.getElementById('optimizeOverlay');
  overlay.style.display = 'flex';
  document.getElementById('optAggregate').checked = false;
  document.getElementById('optDeleteDays').value = '0';
}

function hideOptimizeDialog() {
  document.getElementById('optimizeOverlay').style.display = 'none';
}

async function executeOptimize() {
  hideOptimizeDialog();
  const btn = document.getElementById('optimizeDbBtn');
  const status = document.getElementById('optimizeStatus');
  btn.disabled = true;
  status.textContent = '优化中...';
  try {
    const aggregate = document.getElementById('optAggregate').checked;
    const deleteDays = parseInt(document.getElementById('optDeleteDays').value) || 0;
    const resp = await fetch('/api/admin/optimize', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({aggregate, delete_days: deleteDays}),
    });
    const data = await resp.json();
    if (data.ok) {
      const fname = data.backup.replace(/\\/g, '/').split('/').pop();
      status.textContent = `完成! 备份: ${fname}, 当前体积: ${data.size_mb} MB`;
    } else {
      status.textContent = '失败: ' + (data.error || '未知错误');
    }
  } catch(e) {
    status.textContent = '请求失败';
  }
  btn.disabled = false;
}

// ---- Helpers ----
function fmtAddr(host, port) {
  if (port == null) return esc(host);
  return esc(host) + ':' + port;
}
function avatarUrl(uuid, name) {
  // 优先用 UUID，名称含空格则为无效 Minecraft 用户名
  const id = uuid ? uuid.trim() : '';
  if (id) return `https://crafthead.net/avatar/${encodeURIComponent(id)}`;
  const cleanName = (name || '').trim();
  if (!cleanName || cleanName.includes(' ')) return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Crect width=%2220%22 height=%2220%22 fill=%22%23475569%22/%3E%3C/svg%3E';
  return `https://crafthead.net/avatar/${encodeURIComponent(cleanName)}`;
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
  document.getElementById('srvHost').value = c.host || '0.0.0.0';
  document.getElementById('srvPort').value = c.port || 9000;
  document.getElementById('dbPath').value = c.db_path || 'monitor.db';
  document.getElementById('offlineThreshold').value = c.offline_threshold || 2;
  _offlineThreshold = c.offline_threshold || 2;
  _requireLoginEnabled = c.require_login || false;
});
updateServerNotifBtn();
