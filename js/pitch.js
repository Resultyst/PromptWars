// pitch.js — Guided demo / pitch mode for judges

const PitchMode = (() => {
  const STEPS = [
    {
      title: '👋 Welcome to FlowSense AI',
      body: 'A real-time crowd intelligence platform for M. Chinnaswamy Stadium, Bengaluru. 38,000 fans. Zero panic. Let\'s walk through the key features.',
      highlight: null,
      duration: 4000,
    },
    {
      title: '🗺 Live Stadium Heatmap',
      body: 'The central map shows real-time crowd density per zone. Green = safe. Yellow = elevated. Orange = high. Red = CRITICAL. Hover any zone for live stats.',
      highlight: 'stadium-canvas',
      duration: 5000,
    },
    {
      title: '📊 Zone Intelligence',
      body: 'Each stand is monitored individually. Current capacity, gate wait times, and concession queue estimates update every second — powered by sensor simulation.',
      highlight: 'zone-list',
      duration: 5000,
    },
    {
      title: '🚨 Smart Alert System',
      body: 'FlowSense AI auto-generates severity-graded alerts. The Club House Pavilion is at 91% — a critical alert was raised automatically and rerouting was activated.',
      highlight: 'alert-feed',
      duration: 5000,
    },
    {
      title: '🔀 AI Routing Suggestions',
      body: 'When a zone exceeds 75% capacity, the AI identifies lower-density adjacent zones and suggests alternative gates — reducing wait times by up to 40%.',
      highlight: 'routing-panel',
      duration: 5000,
    },
    {
      title: '📱 Fan App Integration',
      body: 'Every fan\'s smartphone receives personalized routing guidance. The FlowSense Fan App shows their current zone, recommended gate, and live queue times.',
      highlight: 'fan-app-btn',
      duration: 4500,
    },
    {
      title: '🚨 Emergency Protocol',
      body: 'One click activates full evacuation mode — all zones switch to illuminated safe-exit routing with security, medical, and fire teams simultaneously coordinated.',
      highlight: 'emergency-btn',
      duration: 5000,
    },
    {
      title: '✅ FlowSense AI — Safer Events',
      body: 'Real-time monitoring. Predictive alerts. Smart fan routing. Emergency coordination. Built to prevent the next stadium tragedy — before it happens.',
      highlight: null,
      duration: 5000,
    },
  ];

  let overlay, box, titleEl, bodyEl, prevBtn, nextBtn, stepDots, autoTimer;
  let current = 0;
  let autoPlay = false;

  function init() {
    const btn = document.getElementById('pitch-btn');
    if (btn) btn.addEventListener('click', start);
  }

  function start() {
    current = 0;
    buildOverlay();
    showStep(0);
    document.getElementById('pitch-btn').textContent = '▶ Demo Active';
  }

  function buildOverlay() {
    if (document.getElementById('pitch-overlay')) return;
    overlay = document.createElement('div');
    overlay.id = 'pitch-overlay';
    overlay.innerHTML = `
      <div id="pitch-box">
        <div id="pitch-header">
          <span class="badge badge-warning">🎤 PITCH MODE</span>
          <button id="pitch-close" onclick="window.PitchMode.stop()">✕ Exit</button>
        </div>
        <div id="pitch-step-label" class="mono text-dim">Step 1 / ${STEPS.length}</div>
        <h2 id="pitch-title"></h2>
        <p id="pitch-body"></p>
        <div id="pitch-dots"></div>
        <div id="pitch-controls">
          <button id="pitch-prev" onclick="window.PitchMode.prev()">← Prev</button>
          <button id="pitch-autoplay" onclick="window.PitchMode.toggleAuto()">▶ Auto</button>
          <button id="pitch-next" onclick="window.PitchMode.next()">Next →</button>
        </div>
        <div id="pitch-progress"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    box = overlay.querySelector('#pitch-box');
    titleEl = overlay.querySelector('#pitch-title');
    bodyEl  = overlay.querySelector('#pitch-body');
    stepDots = overlay.querySelector('#pitch-dots');
  }

  function showStep(i) {
    clearTimeout(autoTimer);
    const step = STEPS[i];
    if (!step) return;

    // Update text
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    document.getElementById('pitch-step-label').textContent = `Step ${i+1} / ${STEPS.length}`;

    // Dots
    stepDots.innerHTML = STEPS.map((_,j) =>
      `<span class="pitch-dot ${j===i?'active':''}" onclick="window.PitchMode.goto(${j})"></span>`
    ).join('');

    // Highlight
    document.querySelectorAll('.pitch-highlight').forEach(el => el.classList.remove('pitch-highlight'));
    if (step.highlight) {
      const target = document.getElementById(step.highlight);
      if (target) target.classList.add('pitch-highlight');
    }

    // Auto-advance
    if (autoPlay) {
      autoTimer = setTimeout(() => { if (current < STEPS.length-1) next(); else stop(); }, step.duration);
    }

    // Progress bar
    const progress = overlay.querySelector('#pitch-progress');
    if (progress) progress.style.width = `${((i+1)/STEPS.length)*100}%`;
  }

  function next() { if (current < STEPS.length-1) { current++; showStep(current); } }
  function prev() { if (current > 0) { current--; showStep(current); } }
  function goto(i) { current = i; showStep(i); }
  function toggleAuto() {
    autoPlay = !autoPlay;
    const btn = document.getElementById('pitch-autoplay');
    if (btn) btn.textContent = autoPlay ? '⏸ Pause' : '▶ Auto';
    if (autoPlay) showStep(current);
  }
  function stop() {
    clearTimeout(autoTimer);
    autoPlay = false;
    const ov = document.getElementById('pitch-overlay');
    if (ov) ov.remove();
    document.querySelectorAll('.pitch-highlight').forEach(el => el.classList.remove('pitch-highlight'));
    const btn = document.getElementById('pitch-btn');
    if (btn) btn.textContent = '🎤 Pitch Mode';
  }

  return { init, start, stop, next, prev, goto, toggleAuto };
})();

window.PitchMode = PitchMode;
