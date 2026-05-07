// Register zoom plugin (CDN global is ChartZoom)
(function() {
  const p = (window.ChartZoom?.default || window.ChartZoom);
  if (p && p.id) { Chart.register(p); }
})();

// ---- State ----
let chartFullMin = 0;
let chartFullMax = 0;
let chartTotalDuration = 0;
let scrollbarDragging = false;

// 十字线插件
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

// 滚动条同步 + 刻度密度 + 数据点抽稀
const scrollbarSyncPlugin = {
  id: 'scrollbarSync',
  afterUpdate(chart) {
    updateScrollbarFromChart(chart);
    // 动态调整刻度数量
    const fullRange = chartFullMax - chartFullMin;
    if (fullRange <= 0) return;
    const viewRange = chart.scales.x.max - chart.scales.x.min;
    const proportion = Math.max(viewRange / fullRange, 0.01);
    const targetTicks = Math.round(Math.max(5, Math.min(30, 12 / proportion)));
    if (chart.options.scales.x.ticks.maxTicksLimit !== targetTicks) {
      chart.options.scales.x.ticks.maxTicksLimit = targetTicks;
    }
    // 动态调整抽稀采样数：基于可见像素宽度
    const chartWidth = chart.chartArea?.width || 800;
    const targetSamples = Math.max(50, chartWidth * 2);
    if (chart.options.plugins.decimation) {
      chart.options.plugins.decimation.samples = targetSamples;
    }
  },
};

// ---- Scrollbar ----
function updateScrollbarFromChart(chart) {
  if (chartTotalDuration < 21600) return;
  const xScale = chart.scales.x;
  if (!xScale) return;
  const viewMin = xScale.min;
  const viewMax = xScale.max;
  const range = chartFullMax - chartFullMin;
  if (range <= 0) return;

  const leftPct = Math.max(0, (viewMin - chartFullMin) / range * 100);
  const widthPct = Math.max(2, Math.min(100, (viewMax - viewMin) / range * 100));

  const thumb = document.getElementById('scrollbarThumb');
  thumb.style.left = leftPct + '%';
  thumb.style.width = widthPct + '%';
}

function setChartViewport(viewMin, viewMax) {
  if (!historyChart) return;
  const fullRange = chartFullMax - chartFullMin;
  const viewRange = viewMax - viewMin;
  if (viewMin < chartFullMin) { viewMin = chartFullMin; viewMax = viewMin + viewRange; }
  if (viewMax > chartFullMax) { viewMin = chartFullMax - viewRange; viewMax = chartFullMax; }

  historyChart.options.scales.x.min = viewMin;
  historyChart.options.scales.x.max = viewMax;
  historyChart.update('none');
}

function initScrollbar() {
  const track = document.getElementById('scrollbarTrack');
  const thumb = document.getElementById('scrollbarThumb');
  if (!track || !thumb || track._scrollbarInited) return;
  track._scrollbarInited = true;

  let dragging = false;
  let startX = 0;
  let startLeftPct = 0;

  function getClientX(e) {
    return e.touches ? e.touches[0].clientX : e.clientX;
  }

  function onDragStart(e) {
    dragging = true;
    startX = getClientX(e);
    startLeftPct = parseFloat(thumb.style.left) || 0;
    e.preventDefault();
    e.stopPropagation();
  }

  function onTrackClick(e) {
    if (e.target === thumb) return;
    const rect = track.getBoundingClientRect();
    const clickPct = (getClientX(e) - rect.left) / rect.width * 100;
    const thumbWidthPct = parseFloat(thumb.style.width) || 100;
    const targetLeftPct = Math.max(0, Math.min(100 - thumbWidthPct, clickPct - thumbWidthPct / 2));
    applyScrollbarPan(targetLeftPct);
  }

  function onDragMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const trackRect = track.getBoundingClientRect();
    const dxPct = (getClientX(e) - startX) / trackRect.width * 100;
    const thumbWidthPct = parseFloat(thumb.style.width) || 100;
    const newLeft = Math.max(0, Math.min(100 - thumbWidthPct, startLeftPct + dxPct));
    applyScrollbarPan(newLeft);
  }

  function onDragEnd() {
    dragging = false;
  }

  thumb.addEventListener('mousedown', onDragStart);
  thumb.addEventListener('touchstart', onDragStart, {passive: false});
  track.addEventListener('mousedown', onTrackClick);
  track.addEventListener('touchstart', onTrackClick, {passive: false});
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('touchmove', onDragMove, {passive: false});
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchend', onDragEnd);
}

function applyScrollbarPan(pct) {
  if (!historyChart) return;
  const fullRange = chartFullMax - chartFullMin;
  const viewRange = historyChart.scales.x.max - historyChart.scales.x.min;
  const targetMin = chartFullMin + (pct / 100) * fullRange;

  scrollbarDragging = true;
  setChartViewport(targetMin, targetMin + viewRange);
  scrollbarDragging = false;
}

function updateZoomControls(visible) {
  document.getElementById('chartScrollbar').style.display = visible ? 'block' : 'none';
  document.getElementById('resetZoomBtn').style.display = visible ? 'inline-block' : 'none';
  if (visible) initScrollbar();
}

// ---- Chart ----
function createChart(labels, values, yMax, range, totalDuration, showDate) {
  const ctx = document.getElementById('historyChart').getContext('2d');

  chartFullMin = labels.length > 0 ? labels[0].getTime() : 0;
  chartFullMax = labels.length > 0 ? labels[labels.length - 1].getTime() : 0;
  chartTotalDuration = totalDuration;

  const enableZoom = totalDuration >= 21600;
  const plugins = [crosshairPlugin];
  if (enableZoom) plugins.push(scrollbarSyncPlugin);

  const zoomConfig = enableZoom ? {
    zoom: {
      wheel: { enabled: true },
      drag: { enabled: true, backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.3)' },
      pinch: { enabled: true },
      mode: 'x',
    },
    pan: { enabled: true, mode: 'x' },
    limits: {
      x: { min: chartFullMin, max: chartFullMax, minRange: 60000 },
    },
  } : undefined;

  const tickLimit = enableZoom ? 20 : 10;
  const xScaleConfig = {
    type: 'time',
    time: {
      tooltipFormat: showDate ? 'MM-dd HH:mm:ss' : 'HH:mm:ss',
      displayFormats: showDate
        ? { second: 'MM-dd HH:mm:ss', minute: 'MM-dd HH:mm', hour: 'MM-dd HH:mm', day: 'MM-dd' }
        : { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm' },
    },
    ticks: { color: '#94a3b8', maxTicksLimit: tickLimit, font: { size: 10 } },
    grid: { color: 'rgba(255,255,255,0.04)' },
  };
  if (enableZoom) {
    xScaleConfig.min = chartFullMin;
    xScaleConfig.max = chartFullMax;
  }

  // 转为 {x, y} 格式以启用 LTTB 抽稀
  const pointData = labels.map((l, i) => ({x: l.getTime(), y: values[i]}));

  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        data: pointData,
        parsing: false,
        label: '在线玩家',
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
      parsing: false,
      plugins: {
        legend: { display: false },
        decimation: {
          enabled: true,
          algorithm: 'lttb',
          samples: 400,
        },
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
        zoom: zoomConfig,
      },
      scales: {
        x: xScaleConfig,
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
    plugins: plugins,
  });

  updateZoomControls(enableZoom);
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
  let totalDuration = 0;
  if (range === 'custom') {
    const sDate = document.getElementById('rangeStartDate').value;
    const sTime = document.getElementById('rangeStartTime').value || '00:00';
    const eDate = document.getElementById('rangeEndDate').value;
    const eTime = document.getElementById('rangeEndTime').value || '23:59';
    if (!sDate || !eDate) return;
    const startTs = new Date(sDate + 'T' + sTime).getTime() / 1000;
    const endTs = new Date(eDate + 'T' + eTime).getTime() / 1000;
    totalDuration = endTs - startTs;
    url = `/api/servers/${sid}/history?start=${startTs}&end=${endTs}`;
  } else if (range && RANGE_SECONDS[range]) {
    totalDuration = RANGE_SECONDS[range];
  }

  const resp = await fetch(url);
  const data = await resp.json();

  historyData = data;
  chartCurrentRange = range;
  chartLastTs = data.length > 0 ? data[data.length - 1].timestamp : 0;

  const labels = data.map(d => new Date(d.timestamp * 1000));
  const values = data.map(d => d.player_count || (d.online ? 0 : null));
  const yMax = computeYMax(values);

  const showDate = ['24h', '7d', '30d'].includes(range) || (range === 'custom' && totalDuration > 86400);

  if (historyChart) historyChart.destroy();
  createChart(labels, values, yMax, range, totalDuration, showDate);
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

  // 更新为 {x, y} 格式
  historyChart.data.datasets[0].data = historyData.map(d => ({x: d.timestamp * 1000, y: d.player_count || (d.online ? 0 : null)}));
  historyChart.options.scales.y.max = computeYMax(historyData.map(d => d.player_count || (d.online ? 0 : null)));
  historyChart.update('default');
}

async function showPinnedPlayers(point) {
  const section = document.getElementById('pinnedSection');
  section.classList.add('visible');
  const showDate = chartTotalDuration > 86400;
  document.getElementById('pinnedTime').textContent = new Date(point.timestamp * 1000).toLocaleString('zh-CN',
    showDate ? {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}
             : {hour:'2-digit',minute:'2-digit',second:'2-digit'});

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

// ---- Event Handlers ----
document.getElementById('unpinBtn').addEventListener('click', () => {
  pinnedPoint = null;
  document.getElementById('pinnedSection').classList.remove('visible');
});

document.getElementById('resetZoomBtn').addEventListener('click', () => {
  if (!historyChart) return;
  setChartViewport(chartFullMin, chartFullMax);
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
