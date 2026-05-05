// 十字线插件：鼠标悬停时画竖线
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(chart) {
    const active = chart.tooltip?.getActiveElements();
    if (!active || active.length === 0) return;
    const x = active[0].element.x;
    const yScale = chart.scales.y;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, yScale.top);
    ctx.lineTo(x, yScale.bottom);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.restore();
  },
};

function createChart(labels, values, yMax, range) {
  const showDate = ['24h', '7d', '30d'].includes(range);
  const ctx = document.getElementById('historyChart').getContext('2d');
  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '在线玩家',
        data: values,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.1)',
        fill: true, tension: 0.3,
        pointRadius: 2, pointHoverRadius: 7,
        pointBackgroundColor: '#6366f1',
        pointHoverBackgroundColor: '#f59e0b',
        borderWidth: 1.5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 400, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => {
              const d = new Date(items[0].parsed.x);
              return showDate
                ? d.toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})
                : d.toLocaleString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
            },
            label: ctx => `在线: ${ctx.parsed.y} 人`,
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: {
            tooltipFormat: showDate ? 'MM-dd HH:mm:ss' : 'HH:mm:ss',
            displayFormats: showDate
              ? { hour: 'MM-dd HH:mm', day: 'MM-dd' }
              : { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm' },
          },
          ticks: { color: '#94a3b8', maxTicksLimit: 10, font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          beginAtZero: true, max: yMax,
          ticks: { color: '#94a3b8', precision: 0, font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
      },
      onClick: async (event, elements) => {
        if (elements.length === 0) {
          pinnedPoint = null;
          document.getElementById('pinnedSection').classList.remove('visible');
          return;
        }
        const tsSec = elements[0].element.$context.parsed.x / 1000;
        const point = historyData.find(d => Math.abs(d.timestamp - tsSec) < 0.5);
        if (point) { pinnedPoint = point; await showPinnedPlayers(point); }
      },
    },
    plugins: [crosshairPlugin],
  });
}

function computeYMax(values) {
  const dataMax = Math.max(...values.filter(v => v != null), 0);
  return dataMax === 0 ? 5 : dataMax + Math.max(3, Math.ceil(dataMax * 0.2));
}

async function loadHistoryChart(sid, range) {
  document.querySelectorAll('#rangeBtns .btn-outline').forEach(b => b.classList.remove('active-range'));
  const activeBtn = document.querySelector(`#rangeBtns [data-range="${range}"]`);
  if (activeBtn) activeBtn.classList.add('active-range');

  let url = `/api/servers/${sid}/history?range=${range}`;
  if (range === 'custom') {
    const sDate = document.getElementById('rangeStartDate').value;
    const sTime = document.getElementById('rangeStartTime').value || '00:00';
    const eDate = document.getElementById('rangeEndDate').value;
    const eTime = document.getElementById('rangeEndTime').value || '23:59';
    if (!sDate || !eDate) return;
    url = `/api/servers/${sid}/history?start=${new Date(sDate + 'T' + sTime).getTime()/1000}&end=${new Date(eDate + 'T' + eTime).getTime()/1000}`;
  }

  const resp = await fetch(url);
  const data = await resp.json();

  historyData = data;
  chartCurrentRange = range;
  chartLastTs = data.length > 0 ? data[data.length - 1].timestamp : 0;

  const labels = data.map(d => new Date(d.timestamp * 1000));
  const values = data.map(d => d.player_count || (d.online ? 0 : null));
  const yMax = computeYMax(values);

  if (historyChart) historyChart.destroy();
  createChart(labels, values, yMax, range);
}

async function appendRealtimeData(sid) {
  const now = Date.now() / 1000;
  let url = `/api/servers/${sid}/history?start=${chartLastTs || (now - 900)}&end=${now}`;

  const resp = await fetch(url);
  const data = await resp.json();

  if (data.length === 0) return;

  const newPoints = data.filter(d => d.timestamp > chartLastTs + 0.001);
  if (newPoints.length === 0) return;

  const windowStart = now - RANGE_SECONDS['15m'];

  historyData.push(...newPoints);
  historyData = historyData.filter(d => d.timestamp >= windowStart);

  chartLastTs = historyData.length > 0 ? historyData[historyData.length - 1].timestamp : chartLastTs;

  const labels = historyData.map(d => new Date(d.timestamp * 1000));
  const values = historyData.map(d => d.player_count || (d.online ? 0 : null));

  historyChart.data.labels = labels;
  historyChart.data.datasets[0].data = values;
  historyChart.options.scales.y.max = computeYMax(values);
  historyChart.update('default');
}

async function showPinnedPlayers(point) {
  const section = document.getElementById('pinnedSection');
  section.classList.add('visible');
  document.getElementById('pinnedTime').textContent = new Date(point.timestamp * 1000).toLocaleString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'});

  let list = point.player_list || [];
  if (list.length === 0 && detailServerId) {
    const resp = await fetch(`/api/servers/${detailServerId}/player-list?ts=${point.timestamp}`);
    list = await resp.json();
  }
  const plEl = document.getElementById('pinnedPlayerList');
  if (list.length === 0) {
    plEl.innerHTML = '<span style="color:var(--muted);font-size:0.85rem;">该时间点无玩家在线</span>';
  } else {
    plEl.innerHTML = list.map(name => `
      <div class="player-chip" onclick="onPlayerClick('${esc(name)}', '${esc(name)}')" title="点击查看玩家详情 (开发中)">
        <img src="${avatarUrl(null, name)}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Crect width=%2220%22 height=%2220%22 fill=%22%23475569%22/%3E%3C/svg%3E'">
        <span>${esc(name)}</span>
      </div>
    `).join('');
  }
}

document.getElementById('unpinBtn').addEventListener('click', () => {
  pinnedPoint = null;
  document.getElementById('pinnedSection').classList.remove('visible');
});

document.querySelectorAll('#rangeBtns .btn-outline').forEach(btn => {
  btn.addEventListener('click', () => {
    const range = btn.dataset.range;
    if (range === 'custom') {
      document.getElementById('customRangeRow').style.display = 'flex';
      return;
    }
    document.getElementById('customRangeRow').style.display = 'none';
    if (detailServerId) loadHistoryChart(detailServerId, range);
  });
});

document.getElementById('applyCustomRange').addEventListener('click', () => {
  if (detailServerId) loadHistoryChart(detailServerId, 'custom');
});

setInterval(() => {
  if (currentPage === 'detail' && detailServerId) {
    if (chartCurrentRange === '15m') {
      appendRealtimeData(detailServerId);
    }
    loadDetailPage(detailServerId);
  }
}, 5000);
