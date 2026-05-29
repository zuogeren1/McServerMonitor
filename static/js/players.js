let playerFilter = 'all';
let playerSort = 'name';
let playerSearchTerm = '';

document.getElementById('playerSearchInput').addEventListener('input', (e) => {
  playerSearchTerm = e.target.value.trim().toLowerCase();
  loadPlayerList();
});

function renderPlayerRow(p) {
  const displayName = p.anon_count > 0 ? `${esc(p.name)} x${p.anon_count}` : esc(p.name);
  return `
    <div class="item" style="cursor:pointer;align-items:center;" onclick="openPlayerDetail('${esc(p.name)}')">
      <div style="display:flex;align-items:center;gap:0.6rem;">
        <img src="${p.anonymous ? '' : avatarUrl(p.uuid, p.name)}" alt="" style="width:28px;height:28px;border-radius:4px;" onerror="this.style.display='none'">
        <div class="info">
          <strong>${displayName}</strong>
          <small style="color:var(--muted);margin-left:0.4rem;">${p.online ? '<span style=\"color:var(--online);\">● 在线</span>' : '○ 离线'}</small>
          ${p.online ? `<small style="color:var(--muted);margin-left:0.4rem;">${esc(p.current_server)}</small>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:1rem;font-size:0.8rem;color:var(--muted);">
        <span>${formatDuration(p.total_online_seconds)}</span>
        <span>${p.last_seen ? new Date(p.last_seen * 1000).toLocaleString('zh-CN') : '--'}</span>
      </div>
    </div>
  `;
}

async function loadPlayerList() {
  try {
  const url = `/api/players?filter=${playerFilter === 'all' ? '' : playerFilter}&sort=${playerSort}`;
  const resp = await fetch(url);
  const players = await resp.json();

  let anonPlayers = players.filter(p => p.anonymous);
  let normalPlayers = players.filter(p => !p.anonymous);

  if (playerSearchTerm) {
    anonPlayers = anonPlayers.filter(p => p.name.toLowerCase().includes(playerSearchTerm));
    normalPlayers = normalPlayers.filter(p => p.name.toLowerCase().includes(playerSearchTerm));
  }

  const anonSection = document.getElementById('anonymousSection');
  const anonList = document.getElementById('anonymousPlayerList');
  if (anonPlayers.length > 0) {
    anonSection.style.display = 'block';
    anonList.innerHTML = anonPlayers.map(renderPlayerRow).join('');
  } else {
    anonSection.style.display = playerSearchTerm ? 'none' : 'block';
    anonList.innerHTML = playerSearchTerm ? '' : '<div style="color:var(--muted);font-size:0.8rem;">暂无匿名玩家</div>';
  }

  const container = document.getElementById('playerListContainer');
  const empty = document.getElementById('playersEmpty');
  if (normalPlayers.length === 0) {
    container.innerHTML = '';
    empty.style.display = anonPlayers.length === 0 ? 'block' : 'none';
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = normalPlayers.map(renderPlayerRow).join('');
  } catch(e) {}
}

async function copyPlayerName() {
  _copyText(playerDetailName, document);
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
let playerDetailName = null;
let playerDetailPrevPage = 'players';
let pdHourlyChart = null;
let pdCachedUuid = '';  // 单次访问内缓存，刷新图表不重复查询

function openPlayerDetail(name) {
  playerDetailName = name;
  pdCachedUuid = '';  // 新访问重置，触发重新查询
  playerDetailPrevPage = currentPage !== 'player-detail' ? currentPage : playerDetailPrevPage;
  currentPage = 'player-detail';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-player-detail').classList.add('active');
  loadPlayerDetail(name);
}

function goBackFromPlayerDetail() {
  playerDetailName = null;
  if (pdHourlyChart) { pdHourlyChart.destroy(); pdHourlyChart = null; }
  switchPage(playerDetailPrevPage || 'players');
}

async function loadPlayerDetail(name) {
  try {
  const resp = await fetch(`/api/players/${encodeURIComponent(name)}`);
  if (!resp.ok) return;
  const p = await resp.json();

  if (!pdCachedUuid && p.uuid) pdCachedUuid = p.uuid;
  const displayUuid = pdCachedUuid || p.uuid || '--';

  document.getElementById('pdAvatar').src = p.anon_count ? '' : avatarUrl(displayUuid, p.name);
  document.getElementById('pdName').textContent = p.anon_count > 0 ? `Anonymous Player x${p.anon_count}` : p.name;
  const displayName = p.anon_count > 0 ? `Anonymous Player x${p.anon_count}` : p.name;
  document.getElementById('pdName2').innerHTML = `${esc(displayName)} <span class="copy-btn" onclick="copyPlayerName()" title="复制名称" style="cursor:pointer;"><svg class="svg-icon sm copy-icon" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M7 9.667A2.667 2.667 0 0 1 9.667 7h8.666A2.667 2.667 0 0 1 21 9.667v8.666A2.667 2.667 0 0 1 18.333 21H9.667A2.667 2.667 0 0 1 7 18.333z"/><path d="M4.012 16.737A2 2 0 0 1 3 15V5c0-1.1.9-2 2-2h10c.75 0 1.158.385 1.5 1"/></g></svg><svg class="svg-icon sm check-icon" viewBox="0 0 24 24" style="display:none;"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  document.getElementById('pdUuid').textContent = displayUuid;
  document.getElementById('pdOnline').innerHTML = p.online ? '<span style="color:var(--online);">● 在线</span>' : '<span style="color:var(--muted);">离线</span>';
  document.getElementById('pdTotalTime').textContent = formatDuration(p.total_online_seconds);
  document.getElementById('pdFirstSeen').textContent = p.first_seen ? new Date(p.first_seen * 1000).toLocaleString('zh-CN') : '--';

  const tag = document.getElementById('pdStatusTag');
  tag.textContent = p.online ? '在线' : '离线';
  tag.className = 'status-tag ' + (p.online ? 'online' : 'offline');

  // Current server — 用户选中文字时跳过更新
  const csEl = document.getElementById('pdCurrentServer');
  const csHtml = (p.online && p.current_server)
    ? `<div style="color:var(--online);font-size:0.85rem;">当前在线于: <strong>${esc(p.current_server)}</strong></div>` : '';
  _setHtmlSafe(csEl, csHtml);

  // Recent servers — 用户选中文字时跳过更新
  const rsEl = document.getElementById('pdRecentServers');
  const rsEmpty = document.getElementById('pdServersEmpty');
  const servers = p.recent_servers || [];
  let rsHtml = '';
  if (servers.length === 0) {
    rsHtml = '';
    rsEmpty.style.display = 'block';
  } else {
    rsEmpty.style.display = 'none';
    rsHtml = servers.map((s, i) => {
      const login = new Date(s.login_time * 1000).toLocaleString('zh-CN');
      const logout = s.logout_time ? new Date(s.logout_time * 1000).toLocaleString('zh-CN') : '至今';
      return `<div class="info-row">
        <span class="lbl">${esc(s.server_name)}</span>
        <span class="val" style="font-size:0.75rem;color:var(--muted);">${login} ~ ${logout}</span>
      </div>`;
    }).join('');
  }
  _setHtmlSafe(rsEl, rsHtml);

  const hourly = p.hourly_minutes || new Array(24).fill(0);
  const ctx = document.getElementById('pdHourlyChart').getContext('2d');
  const chartIsMobile = window.matchMedia('(max-width: 768px)').matches;
  if (pdHourlyChart) pdHourlyChart.destroy();

  const barLabelPlugin = {
    id: 'barLabels',
    afterDatasetsDraw(chart) {
      const { ctx, scales: { x, y }, data } = chart;
      const dataset = data.datasets[0];
      const labelFont = chartIsMobile ? 8 : 9;
      ctx.save();
      ctx.font = `${labelFont}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#94a3b8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const meta = chart.getDatasetMeta(0);
      for (let i = 0; i < dataset.data.length; i++) {
        const val = dataset.data[i];
        if (!val) continue;
        const bar = meta.data[i];
        ctx.fillText(val.toFixed(1), bar.x, bar.y - 2);
      }
      ctx.restore();
    },
  };

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
    plugins: [barLabelPlugin],
  });
  } catch(e) {}
}
