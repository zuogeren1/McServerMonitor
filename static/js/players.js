let playerFilter = 'all';
let playerSort = 'name';

async function loadPlayerList() {
  const url = `/api/players?filter=${playerFilter === 'all' ? '' : playerFilter}&sort=${playerSort}`;
  const resp = await fetch(url);
  const players = await resp.json();

  const container = document.getElementById('playerListContainer');
  const empty = document.getElementById('playersEmpty');
  if (players.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = players.map(p => `
    <div class="item" style="cursor:pointer;align-items:center;" onclick="openPlayerDetail('${esc(p.uuid)}')">
      <div style="display:flex;align-items:center;gap:0.6rem;">
        <img src="${avatarUrl(p.online ? p.uuid : null, p.name)}" alt="" style="width:28px;height:28px;border-radius:4px;" onerror="this.style.display='none'">
        <div class="info">
          <strong>${esc(p.name)}</strong>
          <small style="color:var(--muted);margin-left:0.4rem;">${p.online ? '<span style=\"color:var(--online);\">● 在线</span>' : '○ 离线'}</small>
          ${p.online ? `<small style="color:var(--muted);margin-left:0.4rem;">${esc(p.current_server)}</small>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:1rem;font-size:0.8rem;color:var(--muted);">
        <span>${formatDuration(p.total_online_seconds)}</span>
        <span>${p.last_seen ? new Date(p.last_seen * 1000).toLocaleString('zh-CN') : '--'}</span>
      </div>
    </div>
  `).join('');
}

function formatDuration(sec) {
  if (!sec || sec < 60) return Math.round(sec) + '秒';
  if (sec < 3600) return Math.round(sec / 60) + '分';
  return (sec / 3600).toFixed(1) + '小时';
}

document.getElementById('playerSort').addEventListener('change', (e) => {
  playerSort = e.target.value;
  loadPlayerList();
});

document.querySelectorAll('#page-players .btn-outline').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#page-players .btn-outline').forEach(b => b.classList.remove('active-filter'));
    btn.classList.add('active-filter');
    playerFilter = btn.dataset.filter;
    loadPlayerList();
  });
});

// ---- Player Detail ----
let playerDetailUuid = null;
let playerDetailPrevPage = 'players';
let pdHourlyChart = null;

function openPlayerDetail(uuid) {
  playerDetailUuid = uuid;
  playerDetailPrevPage = currentPage !== 'player-detail' ? currentPage : playerDetailPrevPage;
  currentPage = 'player-detail';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-player-detail').classList.add('active');
  loadPlayerDetail(uuid);
}

function goBackFromPlayerDetail() {
  playerDetailUuid = null;
  if (pdHourlyChart) { pdHourlyChart.destroy(); pdHourlyChart = null; }
  switchPage(playerDetailPrevPage || 'players');
}

async function loadPlayerDetail(uuid) {
  const resp = await fetch(`/api/players/${encodeURIComponent(uuid)}`);
  if (!resp.ok) return;
  const p = await resp.json();

  document.getElementById('pdAvatar').src = avatarUrl(p.online ? p.uuid : null, p.name);
  document.getElementById('pdName').textContent = p.name;
  document.getElementById('pdName2').textContent = p.name;
  document.getElementById('pdUuid').textContent = p.uuid;
  document.getElementById('pdOnline').innerHTML = p.online ? '<span style="color:var(--online);">● 在线</span>' : '<span style="color:var(--muted);">离线</span>';
  document.getElementById('pdTotalTime').textContent = formatDuration(p.total_online_seconds);
  document.getElementById('pdFirstSeen').textContent = p.first_seen ? new Date(p.first_seen * 1000).toLocaleString('zh-CN') : '--';

  const tag = document.getElementById('pdStatusTag');
  tag.textContent = p.online ? '在线' : '离线';
  tag.className = 'status-tag ' + (p.online ? 'online' : 'offline');

  // Current server
  const csEl = document.getElementById('pdCurrentServer');
  if (p.online && p.current_server) {
    csEl.innerHTML = `<div style="color:var(--online);font-size:0.85rem;">当前在线于: <strong>${esc(p.current_server)}</strong></div>`;
  } else {
    csEl.innerHTML = '';
  }

  // Recent servers
  const rsEl = document.getElementById('pdRecentServers');
  const rsEmpty = document.getElementById('pdServersEmpty');
  const servers = p.recent_servers || [];
  if (servers.length === 0) {
    rsEl.innerHTML = '';
    rsEmpty.style.display = 'block';
  } else {
    rsEmpty.style.display = 'none';
    rsEl.innerHTML = servers.map((s, i) => {
      const login = new Date(s.login_time * 1000).toLocaleString('zh-CN');
      const logout = s.logout_time ? new Date(s.logout_time * 1000).toLocaleString('zh-CN') : '至今';
      return `<div class="info-row">
        <span class="lbl">${esc(s.server_name)}</span>
        <span class="val" style="font-size:0.75rem;color:var(--muted);">${login} ~ ${logout}</span>
      </div>`;
    }).join('');
  }

  // Hourly chart
  const hourly = p.hourly_minutes || new Array(24).fill(0);
  const ctx = document.getElementById('pdHourlyChart').getContext('2d');
  const chartIsMobile = window.matchMedia('(max-width: 768px)').matches;
  if (pdHourlyChart) pdHourlyChart.destroy();
  pdHourlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({length: 24}, (_, i) => i + '时'),
      datasets: [{
        label: '在线时长(分钟)',
        data: hourly,
        backgroundColor: 'rgba(99,102,241,0.6)',
        borderColor: '#6366f1',
        borderWidth: 1,
        borderRadius: chartIsMobile ? 1 : 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y.toFixed(1)} 分钟`,
            title: items => items[0].label,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            font: { size: chartIsMobile ? 10 : 8 },
            autoSkip: chartIsMobile,
            maxTicksLimit: chartIsMobile ? 8 : 24,
            maxRotation: 0,
            align: 'center',
          },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8', font: { size: 9 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
      },
    },
  });
}
