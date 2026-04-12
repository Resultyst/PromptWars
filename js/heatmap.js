// heatmap.js — Canvas-based stadium renderer

const HeatMap = (() => {
  let canvas, ctx, cx, cy, animFrame;
  let particles = [];
  let hoveredZone = null;
  let pulsePhase = 0;

  const INNER_R = 118;   // outfield boundary
  const OUTER_R = 200;   // stands outer edge
  const PITCH_W = 14;
  const PITCH_H = 85;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', () => { hoveredZone = null; });
    initParticles();
    loop();
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, 520);
    canvas.width  = size;
    canvas.height = size;
    cx = size / 2;
    cy = size / 2;
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - cx;
    const my = e.clientY - rect.top  - cy;
    const dist = Math.sqrt(mx*mx + my*my);
    hoveredZone = null;
    if (dist < INNER_R || dist > OUTER_R + 15) return;
    let angle = Math.atan2(my, mx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    const { ZONE_DEFS } = window.Simulation;
    ZONE_DEFS.forEach(def => {
      let s = def.startDeg, e2 = def.endDeg;
      if (s > e2) { // wraps 360
        if (angle >= s || angle <= e2) hoveredZone = def.id;
      } else {
        if (angle >= s && angle <= e2) hoveredZone = def.id;
      }
    });
  }

  function initParticles() {
    const { ZONE_DEFS } = window.Simulation;
    particles = [];
    ZONE_DEFS.forEach(def => {
      const count = 18;
      for (let i = 0; i < count; i++) {
        const midDeg = (def.startDeg + def.endDeg) / 2;
        const spread = (def.endDeg - def.startDeg) * 0.4;
        const angle = toRadP(midDeg + (Math.random()-0.5)*spread);
        const r = INNER_R + 8 + Math.random()*(OUTER_R - INNER_R - 16);
        particles.push({ zoneId: def.id, angle, r, speed: (Math.random()-0.5)*0.003, size: 1.5 + Math.random()*2, alpha: 0.4 + Math.random()*0.5, drift: Math.random()*Math.PI*2 });
      }
    });
  }

  function toRadP(d) { return d * Math.PI / 180; }

  function loop() {
    animFrame = requestAnimationFrame(loop);
    pulsePhase += 0.04;
    draw();
  }

  function draw() {
    const { state, densityColor } = window.Simulation;
    const em = state.emergencyMode;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, OUTER_R + 30);
    bg.addColorStop(0, '#0D1526');
    bg.addColorStop(1, '#04080F');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── Draw zone arcs ──
    const { ZONE_DEFS } = window.Simulation;
    ZONE_DEFS.forEach(def => {
      const z = state.zones[def.id];
      if (!z) return;
      const s = toRadP(def.startDeg);
      const e = toRadP(def.endDeg);
      const GAP = 0.03;
      const color = em ? 'rgba(255,34,85,0.6)' : densityColor(z.density);
      const isHov = hoveredZone === def.id;

      // Zone fill
      ctx.beginPath();
      ctx.arc(cx, cy, OUTER_R + (isHov ? 6 : 0), s + GAP, e - GAP);
      ctx.arc(cx, cy, INNER_R, e - GAP, s + GAP, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Glow on critical/danger
      if (z.density > 0.75 && !em) {
        ctx.beginPath();
        ctx.arc(cx, cy, OUTER_R + (isHov ? 6 : 0), s + GAP, e - GAP);
        ctx.arc(cx, cy, INNER_R, e - GAP, s + GAP, true);
        ctx.closePath();
        const glowAlpha = 0.15 + 0.1 * Math.sin(pulsePhase + def.startDeg);
        ctx.fillStyle = z.density > 0.9 ? `rgba(255,34,85,${glowAlpha})` : `rgba(255,96,48,${glowAlpha * 0.7})`;
        ctx.fill();
      }

      // Emergency pulse
      if (em) {
        ctx.beginPath();
        ctx.arc(cx, cy, OUTER_R + (isHov ? 6 : 0), s + GAP, e - GAP);
        ctx.arc(cx, cy, INNER_R, e - GAP, s + GAP, true);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,34,85,${0.2 + 0.2*Math.abs(Math.sin(pulsePhase))})`;
        ctx.fill();
      }

      // Zone border
      ctx.beginPath();
      ctx.arc(cx, cy, OUTER_R + (isHov ? 6 : 0), s + GAP, e - GAP);
      ctx.strokeStyle = isHov ? 'rgba(0,191,255,0.7)' : 'rgba(0,0,0,0.6)';
      ctx.lineWidth = isHov ? 2 : 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, INNER_R, s + GAP, e - GAP);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Zone label
      const lAngle = toRadP(def.labelDeg);
      const lR = 158;
      const lx = cx + Math.cos(lAngle) * lR;
      const ly = cy + Math.sin(lAngle) * lR;
      ctx.save();
      ctx.translate(lx, ly);
      let rot = lAngle;
      if (rot > Math.PI/2 && rot < Math.PI*3/2) rot += Math.PI;
      ctx.rotate(rot);
      ctx.textAlign = 'center';
      ctx.fillStyle = isHov ? '#EEF2FF' : 'rgba(238,242,255,0.55)';
      ctx.font = `600 ${isHov ? 11 : 10}px 'JetBrains Mono', monospace`;
      ctx.fillText(`${Math.round(z.density*100)}%`, 0, 0);
      ctx.restore();

      // Gate markers
      drawGate(def, s, em);

      // Hover tooltip
      if (isHov) drawTooltip(z, def, lAngle, lR);
    });

    // ── Outfield ──
    const outfield = ctx.createRadialGradient(cx, cy, 0, cx, cy, INNER_R);
    outfield.addColorStop(0, '#1A3A2A');
    outfield.addColorStop(0.6, '#152F22');
    outfield.addColorStop(1, '#0F2218');
    ctx.beginPath();
    ctx.ellipse(cx, cy, INNER_R, INNER_R - 8, 0, 0, Math.PI*2);
    ctx.fillStyle = outfield;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,180,80,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Boundary circle
    ctx.beginPath();
    ctx.ellipse(cx, cy, INNER_R - 22, INNER_R - 30, 0, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Cricket Pitch ──
    ctx.save();
    ctx.translate(cx, cy);
    const pitchGrad = ctx.createLinearGradient(-PITCH_W/2, -PITCH_H/2, PITCH_W/2, PITCH_H/2);
    pitchGrad.addColorStop(0, '#C8A96E');
    pitchGrad.addColorStop(0.5, '#D4B87A');
    pitchGrad.addColorStop(1, '#C8A96E');
    ctx.fillStyle = pitchGrad;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.fillRect(-PITCH_W/2, -PITCH_H/2, PITCH_W, PITCH_H);
    ctx.strokeRect(-PITCH_W/2, -PITCH_H/2, PITCH_W, PITCH_H);
    // Crease lines
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-PITCH_W/2, -PITCH_H/2 + 14);
    ctx.lineTo(PITCH_W/2, -PITCH_H/2 + 14);
    ctx.moveTo(-PITCH_W/2, PITCH_H/2 - 14);
    ctx.lineTo(PITCH_W/2, PITCH_H/2 - 14);
    ctx.stroke();
    ctx.restore();

    // ── FlowSense logo in center ──
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,191,255,0.5)';
    ctx.font = `600 9px 'JetBrains Mono', monospace`;
    ctx.fillText('FLOW', cx, cy - 5);
    ctx.fillText('SENSE', cx, cy + 6);
    ctx.restore();

    // ── Crowd particles ──
    drawParticles(state);

    // ── Emergency evacuation routes ──
    if (em) drawEvacRoutes();
  }

  function drawGate(def, sAngle, em) {
    const gAngle = toRadP(def.startDeg);
    const gx = cx + Math.cos(gAngle) * (OUTER_R + 12);
    const gy = cy + Math.sin(gAngle) * (OUTER_R + 12);
    ctx.beginPath();
    ctx.arc(gx, gy, 8, 0, Math.PI*2);
    ctx.fillStyle = em ? 'rgba(255,34,85,0.9)' : 'rgba(0,191,255,0.85)';
    ctx.fill();
    ctx.strokeStyle = '#04080F';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 7px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letter = def.gate.replace('Gate ','');
    ctx.fillText(letter, gx, gy);
    ctx.textBaseline = 'alphabetic';
  }

  function drawTooltip(z, def, lAngle, lR) {
    const tx = cx + Math.cos(lAngle) * (lR + 55);
    const ty = cy + Math.sin(lAngle) * (lR + 55);
    const pad = 10;
    const lines = [z.name, `${z.gate}`, `${z.occupancy.toLocaleString()} / ${z.cap.toLocaleString()}`, `Wait: ~${z.waitTime} min`];
    const maxW = 140;
    const boxH = lines.length * 16 + pad*2;
    let bx = tx - maxW/2, by = ty - boxH/2;
    bx = Math.max(5, Math.min(canvas.width - maxW - 5, bx));
    by = Math.max(5, Math.min(canvas.height - boxH - 5, by));
    ctx.fillStyle = 'rgba(8,14,26,0.92)';
    ctx.strokeStyle = 'rgba(0,191,255,0.5)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, maxW, boxH, 8);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#EEF2FF';
    ctx.font = `600 11px 'Inter', sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(lines[0], bx+pad, by+pad+10);
    ctx.fillStyle = 'rgba(0,191,255,0.8)';
    ctx.font = `500 10px 'JetBrains Mono', monospace`;
    ctx.fillText(lines[1], bx+pad, by+pad+24);
    ctx.fillStyle = 'rgba(238,242,255,0.6)';
    ctx.font = `400 10px 'Inter', sans-serif`;
    ctx.fillText(lines[2], bx+pad, by+pad+38);
    ctx.fillStyle = '#FFD60A';
    ctx.fillText(lines[3], bx+pad, by+pad+52);
  }

  function drawParticles(state) {
    particles.forEach(p => {
      const z = state.zones[p.zoneId];
      if (!z) return;
      p.angle += p.speed;
      p.drift += 0.02;
      const r = p.r + Math.sin(p.drift) * 3;
      const x = cx + Math.cos(p.angle) * r;
      const y = cy + Math.sin(p.angle) * r;
      const alpha = p.alpha * Math.min(z.density * 1.4, 1);
      ctx.beginPath();
      ctx.arc(x, y, p.size * z.density, 0, Math.PI*2);
      ctx.fillStyle = `rgba(238,242,255,${alpha})`;
      ctx.fill();
    });
  }

  function drawEvacRoutes() {
    const { ZONE_DEFS } = window.Simulation;
    ZONE_DEFS.forEach(def => {
      const s = toRadP(def.startDeg);
      const e = toRadP(def.endDeg);
      const mid = (s + e) / 2;
      const fx = cx + Math.cos(mid) * (OUTER_R + 25);
      const fy = cy + Math.sin(mid) * (OUTER_R + 25);
      const alpha = 0.6 + 0.4 * Math.abs(Math.sin(pulsePhase * 2));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(mid) * INNER_R, cy + Math.sin(mid) * INNER_R);
      ctx.lineTo(fx, fy);
      ctx.strokeStyle = `rgba(0,230,160,${alpha})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(fx, fy, 6, 0, Math.PI*2);
      ctx.fillStyle = `rgba(0,230,160,${alpha})`;
      ctx.fill();
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }

  function destroy() { cancelAnimationFrame(animFrame); }

  return { init, destroy };
})();

window.HeatMap = HeatMap;
