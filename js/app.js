// app.js — Main dashboard orchestrator

document.addEventListener('DOMContentLoaded', () => {
  const { Simulation, HeatMap } = window;
  const { state, STADIUM, bus, initSimulation, tick, densityColor, dismissAlert, triggerEmergency, resolveEmergency } = Simulation;

  // ── Init ──────────────────────────────────────────────────────────────────
  initSimulation();
  HeatMap.init(document.getElementById('stadium-canvas'));

  const tickInterval = setInterval(() => tick(), 600);

  // ── Clock ─────────────────────────────────────────────────────────────────
  function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').textContent = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ── KPI Cards ─────────────────────────────────────────────────────────────
  function updateKPIs() {
    document.getElementById('kpi-fans').textContent    = state.totalInVenue.toLocaleString();
    document.getElementById('kpi-wait').textContent    = `${state.avgWaitTime} min`;
    document.getElementById('kpi-alerts').textContent  = state.alerts.filter(a=>!a.dismissed).length;
    document.getElementById('kpi-safety').textContent  = `${state.safetyScore}/100`;
    document.getElementById('kpi-resolved').textContent = state.alertsResolved;

    const safetyEl = document.getElementById('kpi-safety');
    safetyEl.className = 'kpi-value mono ' + (
      state.safetyScore >= 80 ? 'text-ok' :
      state.safetyScore >= 60 ? 'text-warning' :
      state.safetyScore >= 40 ? 'text-danger' : 'text-critical'
    );

    const pct = Math.round(state.totalInVenue / STADIUM.totalCapacity * 100);
    document.getElementById('stadium-fill-bar').style.width = `${pct}%`;
    document.getElementById('stadium-fill-pct').textContent = `${pct}%`;
    document.getElementById('match-phase').textContent = state.matchPhase.replace(/-/g,' ').toUpperCase();
    document.getElementById('match-minute').textContent = `Min ${Math.round(state.matchMinute)}`;
  }

  // ── Zone List ─────────────────────────────────────────────────────────────
  function renderZones() {
    const list = document.getElementById('zone-list');
    list.innerHTML = '';
    Object.values(state.zones).forEach(z => {
      const pct = Math.round(z.density * 100);
      const item = document.createElement('div');
      item.className = `zone-item glass-card ${z.status}`;
      item.id = `zone-${z.id}`;
      item.innerHTML = `
        <div class="zone-header">
          <div class="zone-name-row">
            <span class="dot dot-${z.status}"></span>
            <span class="zone-name">${z.name}</span>
          </div>
          <span class="badge badge-${z.status === 'ok' ? 'ok' : z.status === 'warning' ? 'warning' : z.status === 'danger' ? 'danger' : 'critical'}">${pct}%</span>
        </div>
        <div class="zone-meta">
          <span class="text-dim">${z.gate}</span>
          <span class="mono text-dim">${z.occupancy.toLocaleString()} / ${z.cap.toLocaleString()}</span>
        </div>
        <div class="density-bar"><div class="density-fill" style="width:${pct}%; background:${densityColor(z.density).replace('0.88','1')}"></div></div>
        <div class="zone-footer"><span class="text-dim" style="font-size:11px">Wait ~${z.waitTime} min</span><span class="text-dim" style="font-size:11px">Concession ~${z.concessionWait} min</span></div>
      `;
      list.appendChild(item);
    });
  }

  // ── Alert Feed ────────────────────────────────────────────────────────────
  function renderAlerts() {
    const feed = document.getElementById('alert-feed');
    feed.innerHTML = '';
    const active = state.alerts.filter(a => !a.dismissed).slice(0,12);
    if (!active.length) {
      feed.innerHTML = '<div class="empty-state">No active alerts</div>';
      return;
    }
    active.forEach(a => {
      const el = document.createElement('div');
      el.className = `alert-item alert-${a.severity}`;
      el.innerHTML = `
        <div class="alert-top">
          <span class="dot dot-${a.severity}"></span>
          <span class="badge badge-${a.severity === 'ok' ? 'ok' : a.severity === 'warning' ? 'warning' : a.severity === 'danger' ? 'danger' : 'critical'}">${a.severity}</span>
          <span class="alert-id mono text-dim">${a.id}</span>
          <button class="dismiss-btn" onclick="window.dismissA('${a.id}')">✕</button>
        </div>
        <p class="alert-msg">${a.message}</p>
        <div class="alert-meta">
          <span class="text-dim" style="font-size:10px">${a.ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
          ${a.action ? `<span class="badge badge-warning" style="font-size:9px">${a.action}</span>` : ''}
        </div>
      `;
      feed.appendChild(el);
    });
  }
  window.dismissA = (id) => { dismissAlert(id); renderAlerts(); updateKPIs(); };

  // ── Routing Panel ─────────────────────────────────────────────────────────
  function renderRouting() {
    const panel = document.getElementById('routing-panel');
    panel.innerHTML = '';
    if (!state.routingSuggestions.length) {
      panel.innerHTML = '<div class="empty-state">All zones within normal parameters</div>';
      return;
    }
    state.routingSuggestions.slice(0,3).forEach(r => {
      const el = document.createElement('div');
      el.className = 'routing-item glass-card';
      const altsHtml = r.alts.map(a => `
        <div class="route-alt">
          <div class="route-alt-name">${a.gate} → ${a.zoneName}</div>
          <div class="route-alt-meta">
            <span class="text-ok" style="font-size:11px">Save ${a.saving}</span>
            <span class="badge badge-ok">${Math.round(a.density*100)}%</span>
          </div>
        </div>
      `).join('');
      el.innerHTML = `
        <div class="routing-header">
          <span class="dot dot-danger"></span>
          <span class="routing-from">${r.fromName}</span>
          <span class="badge badge-danger">${r.reason}</span>
        </div>
        <div class="routing-alts">${altsHtml}</div>
      `;
      panel.appendChild(el);
    });
  }

  // ── Notification Ticker ───────────────────────────────────────────────────
  let tickerQ = [];
  function renderNotifTicker() {
    const ticker = document.getElementById('notif-ticker');
    const recent = state.notifications.slice(0,1)[0];
    if (recent) {
      const sev = recent.severity;
      ticker.innerHTML = `<span class="dot dot-${sev === 'critical' ? 'critical' : sev === 'warning' ? 'warning' : 'ok'}" style="flex-shrink:0"></span><span>${recent.msg}</span>`;
    }
  }

  // ── Notification Feed (sidebar) ───────────────────────────────────────────
  function renderNotifFeed() {
    const feed = document.getElementById('notif-feed');
    feed.innerHTML = '';
    state.notifications.slice(0,8).forEach(n => {
      const el = document.createElement('div');
      el.className = `notif-item notif-${n.severity}`;
      el.innerHTML = `
        <div class="notif-dot"><span class="dot dot-${n.severity === 'critical' ? 'critical' : n.severity === 'warning' ? 'warning' : 'ok'}"></span></div>
        <div class="notif-body">
          <p class="notif-msg">${n.msg}</p>
          <span class="notif-time text-dim mono">${n.ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
        </div>
      `;
      feed.appendChild(el);
    });
  }

  // ── Emergency Toggle ──────────────────────────────────────────────────────
  const emergBtn = document.getElementById('emergency-btn');
  emergBtn.addEventListener('click', () => {
    if (!state.emergencyMode) {
      if (confirm('⚠ Activate Emergency Protocol?\nThis will trigger evacuation mode for all zones.')) {
        triggerEmergency();
        emergBtn.textContent = '🟢 Resolve Emergency';
        emergBtn.classList.add('active');
        document.body.classList.add('emergency-mode');
        renderAlerts(); renderZones();
      }
    } else {
      resolveEmergency();
      emergBtn.textContent = '🚨 Trigger Emergency';
      emergBtn.classList.remove('active');
      document.body.classList.remove('emergency-mode');
    }
  });

  // ── Fan App Link ──────────────────────────────────────────────────────────
  document.getElementById('fan-app-btn').addEventListener('click', () => {
    window.open('fan.html', '_blank');
  });

  // ── Sim Speed ─────────────────────────────────────────────────────────────
  document.getElementById('sim-speed').addEventListener('change', e => {
    state.simSpeed = parseFloat(e.target.value);
  });

  // ── Bus listeners ─────────────────────────────────────────────────────────
  bus.on('tick', () => { updateKPIs(); renderZones(); renderNotifTicker(); });
  bus.on('alert', () => { renderAlerts(); });
  bus.on('alertDismissed', () => { renderAlerts(); });
  bus.on('routing', () => { renderRouting(); });
  bus.on('notification', () => { renderNotifFeed(); renderNotifTicker(); });
  bus.on('emergency', () => { renderAlerts(); renderZones(); });
  bus.on('emergencyResolved', () => { renderAlerts(); renderZones(); });

  // ── First render ──────────────────────────────────────────────────────────
  updateKPIs();
  renderZones();
  renderAlerts();
  renderRouting();
  renderNotifFeed();
  renderNotifTicker();

  // ── Pitch Mode ────────────────────────────────────────────────────────────
  if (window.PitchMode) window.PitchMode.init();
});
