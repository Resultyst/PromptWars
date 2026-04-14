// simulation.js — Core crowd simulation engine for FlowSense AI

const R = Math.PI / 180;
const toRad = deg => deg * R;

const STADIUM = {
  name: 'M. Chinnaswamy Stadium',
  city: 'Bengaluru',
  totalCapacity: 38000,
  matchName: 'RCB vs CSK — IPL 2025',
  matchTime: '19:30 IST',
};

const ZONE_DEFS = [
  { id:'north',     name:'North Stand',        gate:'Gate A', cap:8000, startDeg:240, endDeg:300, labelDeg:270,  lR:170 },
  { id:'northeast', name:'KSCA NE Block',       gate:'Gate B', cap:3500, startDeg:300, endDeg:360, labelDeg:330,  lR:165 },
  { id:'east',      name:'Club House / Pavilion',gate:'Gate C', cap:6000, startDeg:0,   endDeg:60,  labelDeg:30,   lR:170 },
  { id:'south',     name:'South Stand',         gate:'Gate D', cap:8000, startDeg:60,  endDeg:120, labelDeg:90,   lR:170 },
  { id:'southwest', name:'KSCA SW Block',        gate:'Gate E', cap:3500, startDeg:120, endDeg:180, labelDeg:150,  lR:165 },
  { id:'west',      name:'West Stand',          gate:'Gate F', cap:7000, startDeg:180, endDeg:240, labelDeg:210,  lR:170 },
];

// Adjacency for routing
const ADJACENT = {
  north:     ['northeast','west'],
  northeast: ['north','east'],
  east:      ['northeast','south'],
  south:     ['east','southwest'],
  southwest: ['south','west'],
  west:      ['southwest','north'],
};

class EventBus {
  constructor() { this._listeners = {}; }
  on(ev, fn) { (this._listeners[ev] = this._listeners[ev]||[]).push(fn); }
  emit(ev, data) { (this._listeners[ev]||[]).forEach(fn => fn(data)); }
}

const bus = new EventBus();

// ── Simulation State ─────────────────────────────────────────────────────────

const state = {
  tick: 0,
  simSpeed: 1,
  paused: false,
  matchPhase: 'first-innings',
  matchMinute: 35,
  emergencyMode: false,
  totalInVenue: 0,
  safetyScore: 87,
  avgWaitTime: 9,
  alertsResolved: 4,
  zones: {},
  alerts: [],
  notifications: [],
  routingSuggestions: [],
};

// Initial zone densities (mid match, some zones elevated)
const INITIAL = {
  north:     0.82,
  northeast: 0.64,
  east:      0.91,
  south:     0.78,
  southwest: 0.55,
  west:      0.69,
};

function initZones() {
  ZONE_DEFS.forEach(def => {
    const density = INITIAL[def.id];
    state.zones[def.id] = {
      ...def,
      startAngle: toRad(def.startDeg),
      endAngle:   toRad(def.endDeg),
      centerAngle: toRad(def.labelDeg),
      density,
      occupancy: Math.round(def.cap * density),
      status: densityStatus(density),
      waitTime: Math.round(density * 18 + 2),
      concessionWait: Math.round(density * 15 + 3),
    };
  });
  recalcTotals();
}

function densityStatus(d) {
  if (d >= 0.90) return 'critical';
  if (d >= 0.75) return 'danger';
  if (d >= 0.60) return 'warning';
  return 'ok';
}

function densityColor(d) {
  if (d < 0.60) {
    const t = d / 0.60;
    return lerpColor([0,230,160],[255,214,10], t);
  } else if (d < 0.80) {
    const t = (d-0.60)/0.20;
    return lerpColor([255,214,10],[255,96,48], t);
  } else {
    const t = Math.min((d-0.80)/0.20, 1);
    return lerpColor([255,96,48],[255,34,85], t);
  }
}

function lerpColor(a, b, t) {
  return `rgba(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)},0.88)`;
}

function recalcTotals() {
  let total = 0;
  Object.values(state.zones).forEach(z => { total += z.occupancy; });
  state.totalInVenue = total;
  const avgD = total / STADIUM.totalCapacity;
  state.safetyScore = Math.round(100 - avgD * 35 - state.alerts.filter(a=>!a.dismissed).length * 3);
  state.avgWaitTime = Math.round(Object.values(state.zones).reduce((s,z)=>s+z.waitTime,0)/6);
}

// ── Match Event Timeline ─────────────────────────────────────────────────────

const MATCH_EVENTS = [
  { atMin:40,  phase:'drinks-break',    handler: () => drinksBrk() },
  { atMin:60,  phase:'first-innings',   handler: () => {} },
  { atMin:100, phase:'innings-break',   handler: () => inningsBrk() },
  { atMin:120, phase:'second-innings',  handler: () => secondInn() },
  { atMin:160, phase:'last-overs',      handler: () => lastOvers() },
  { atMin:200, phase:'post-match',      handler: () => postMatch() },
];
const firedEvents = new Set();

function drinksBrk() {
  pushAlert('warning','east','KSCA Club House concession queues spiking — drinks break surge', 'routing');
  pushAlert('warning','north','North Stand Gate A extended queue — 400+ fans queued', 'routing');
  nudgeDensity('east', 0.06);
  nudgeDensity('north', 0.04);
  pushNotif('info','Drinks break — concession queues are spiking. Expected wait: 12–18 min.');
}

function inningsBrk() {
  pushAlert('critical','east','CRITICAL: Club House / Pavilion at 97% — immediate rerouting required', 'routing');
  pushAlert('danger','south','South Stand exit bottleneck — 3,200 fans surging toward Gate D', 'routing');
  pushAlert('warning','north','North Stand concourse congestion building', null);
  nudgeDensity('east', 0.07);
  nudgeDensity('south', 0.08);
  nudgeDensity('north', 0.06);
  state.safetyScore = 61;
  pushNotif('critical','⚠ INNINGS BREAK — Major crowd movement. Please follow FlowSense routing guidance.');
  computeRouting();
}

function secondInn() {
  Object.values(state.zones).forEach(z => nudgeDensity(z.id, -0.05));
  pushNotif('info','Second innings underway. Crowd movement stabilising.');
}

function lastOvers() {
  nudgeDensity('east', 0.04);
  nudgeDensity('south', 0.03);
  pushNotif('warning','Last 5 overs — high excitement. Prepare for post-match crowd dispersal.');
}

function postMatch() {
  state.matchPhase = 'post-match';
  Object.values(state.zones).forEach(z => nudgeDensity(z.id, 0.08));
  pushAlert('critical','north','POST-MATCH: Major exit surge all gates — activating dispersal protocol', 'routing');
  pushAlert('danger','south','South Stand Gate D overcrowding — open Gate D2 auxiliary', 'routing');
  pushNotif('critical','⚠ MATCH ENDED — All gates activating dispersal. Follow illuminated exit signage.');
}

function nudgeDensity(id, delta) {
  const z = state.zones[id];
  if (!z) return;
  z.density = Math.max(0.05, Math.min(1.0, z.density + delta));
  z.occupancy = Math.round(z.cap * z.density);
  z.status = densityStatus(z.density);
  z.waitTime = Math.round(z.density * 18 + 2);
  z.concessionWait = Math.round(z.density * 15 + 3);
  syncState();
}

// ── Alerts ───────────────────────────────────────────────────────────────────

function syncState() {
  if (window.FlowBridge) {
    window.FlowBridge.broadcastState(state);
  }
}

let _alertId = 100;
function pushAlert(severity, zoneId, message, action) {
  const alert = {
    id: `ALT-${++_alertId}`,
    severity,
    zone: zoneId,
    zoneName: state.zones[zoneId]?.name || zoneId,
    message,
    action,
    ts: new Date(),
    dismissed: false,
  };
  state.alerts.unshift(alert);
  if (state.alerts.length > 30) state.alerts.length = 30;
  
  // AI PA Announcement for critical alerts
  if (severity === 'critical' && window.StadiumAudio) {
    window.StadiumAudio.announceAlert(message);
  }

  syncState();
  bus.emit('alert', alert);
}

function dismissAlert(id) {
  const a = state.alerts.find(x => x.id === id);
  if (a) { a.dismissed = true; state.alertsResolved++; bus.emit('alertDismissed', id); }
}

// ── Notifications ────────────────────────────────────────────────────────────

const NOTIF_POOL = [
  { sev:'info',    msg:'Gate B processing flow restored — average wait now 4 min.' },
  { sev:'info',    msg:'Concession Zone 2 (West Stand) wait time reduced to 6 min.' },
  { sev:'info',    msg:'Medical team deployed to North Concourse as precaution.' },
  { sev:'warning', msg:'Restroom block R4 (South Stand) at 88% capacity — divert to R5.' },
  { sev:'warning', msg:'Gate C auxiliary lane now open — please redirect fans.' },
  { sev:'info',    msg:'FlowSense AI routed 1,200 fans via Gate F — congestion reduced 18%.' },
  { sev:'info',    msg:'Vendor stall V7 replenished — queue reduced from 22 to 9 min.' },
  { sev:'warning', msg:'NE Block density rising — pre-emptive Gate B2 opening recommended.' },
  { sev:'info',    msg:'Security checkpoint C3 throughput optimised — +40% clearance speed.' },
  { sev:'info',    msg:'Fan navigation push sent to 8,400 fans in Zone East via app.' },
];
let _nPool = 0;

function pushNotif(severity, msg) {
  const n = { id: Date.now(), severity, msg, ts: new Date() };
  state.notifications.unshift(n);
  if (state.notifications.length > 50) state.notifications.length = 50;
  bus.emit('notification', n);
}

// ── Routing ──────────────────────────────────────────────────────────────────

function computeRouting() {
  state.routingSuggestions = [];
  Object.values(state.zones).forEach(z => {
    if (z.density < 0.75) return;
    const alts = ADJACENT[z.id]
      .map(aid => state.zones[aid])
      .filter(az => az && az.density < z.density - 0.10)
      .sort((a,b) => a.density - b.density)
      .slice(0,2)
      .map(az => ({
        zoneId: az.id,
        zoneName: az.name,
        gate: az.gate,
        density: az.density,
        saving: `~${Math.round((z.waitTime - az.waitTime + 2))} min`,
      }));
    if (alts.length) {
      state.routingSuggestions.push({ fromZone: z.id, fromName: z.name, reason: `${Math.round(z.density*100)}% capacity`, alts });
    }
  });
  bus.emit('routing', state.routingSuggestions);
}

// ── Main Tick ────────────────────────────────────────────────────────────────

function tick() {
  if (state.paused || state.emergencyMode) return;
  state.tick++;
  state.matchMinute += 0.05 * state.simSpeed;

  // Check match timeline events
  MATCH_EVENTS.forEach(ev => {
    if (!firedEvents.has(ev.atMin) && state.matchMinute >= ev.atMin) {
      firedEvents.add(ev.atMin);
      state.matchPhase = ev.phase;
      ev.handler();
    }
  });

  // Random micro fluctuations — keeps the dashboard feeling alive
  ZONE_DEFS.forEach(def => {
    const z = state.zones[def.id];
    const jitter = (Math.random() - 0.48) * 0.008 * state.simSpeed;
    nudgeDensity(def.id, jitter);

    // Auto-alert if newly critical
    const prevStatus = z._prevStatus;
    if (z.status !== prevStatus) {
      z._prevStatus = z.status;
      if (z.status === 'critical') {
        pushAlert('critical', def.id, `${z.name} has reached CRITICAL density (${Math.round(z.density*100)}%)`, 'routing');
        if (window.StadiumAudio) window.StadiumAudio.triggerCheer();
      }
      else if (z.status === 'danger') pushAlert('danger', def.id, `${z.name} density at ${Math.round(z.density*100)}% — action recommended`, 'routing');
    }
  });

  // Periodic routing compute
  if (state.tick % 10 === 0) computeRouting();

  // Periodic ambient notifications
  if (state.tick % 20 === 0) {
    const n = NOTIF_POOL[_nPool % NOTIF_POOL.length];
    pushNotif(n.sev, n.msg);
    _nPool++;
  }

  recalcTotals();
  bus.emit('tick', state);
}

// ── Emergency Mode ───────────────────────────────────────────────────────────

function triggerEmergency(type='general') {
  state.emergencyMode = true;
  state.matchPhase = 'EMERGENCY';
  pushAlert('critical','north','🚨 EMERGENCY ACTIVATED — Evacuation protocol initiated', 'evacuate');
  pushAlert('critical','east','🚨 All personnel to emergency stations immediately', 'evacuate');
  pushNotif('critical','🚨 EMERGENCY MODE — Please follow illuminated exit routes calmly.');
  pushNotif('critical','All available security and medical personnel — report to command posts.');
  syncState();
  bus.emit('emergency', { type });
}

function resolveEmergency() {
  state.emergencyMode = false;
  state.matchPhase = 'first-innings';
  pushNotif('info','Emergency resolved. Returning to normal operations.');
  syncState();
  bus.emit('emergencyResolved', {});
}

// ── Init ─────────────────────────────────────────────────────────────────────

function initSimulation() {
  initZones();
  computeRouting();
  // Seed initial alerts
  pushAlert('critical','east','Club House / Pavilion at 91% — reroute fans to Gate D & E', 'routing');
  pushAlert('danger','north','North Stand at 82% — monitor Gate A queue', null);
  pushAlert('warning','south','South Stand elevated density — deploy extra stewards', null);
  // Seed initial notifications
  pushNotif('info','FlowSense AI active — monitoring 38,000-capacity stadium in real time.');
  pushNotif('warning','Club House zone exceeding safe density threshold. Routing active.');
  pushNotif('info','9,200 fans received smart gate guidance via FlowSense app.');
  bus.emit('tick', state);
}

window.Simulation = { state, STADIUM, ZONE_DEFS, ADJACENT, MATCH_EVENTS, bus, initSimulation, tick, densityColor, densityStatus, pushAlert, dismissAlert, pushNotif, computeRouting, triggerEmergency, resolveEmergency, nudgeDensity };
