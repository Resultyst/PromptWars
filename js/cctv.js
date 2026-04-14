// cctv.js — Canvas-rendered surveillance simulation for FlowSense AI

class CCTVFeed {
  constructor(canvasId, zoneId) {
    this.canvas = document.querySelector(`#${canvasId} canvas`);
    this.ctx = this.canvas.getContext('2d');
    this.zoneId = zoneId;
    this.particles = [];
    this.density = 0.5;
    this.status = 'ok';
    this.emergencyMode = false;
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    
    this.init();
  }

  init() {
    this.createParticles(Math.round(this.density * 200));
    this.animate();
  }

  createParticles(count) {
    const currentCount = this.particles.length;
    if (count > currentCount) {
      for (let i = 0; i < count - currentCount; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          size: 1 + Math.random() * 2
        });
      }
    } else if (count < currentCount) {
      this.particles.splice(0, currentCount - count);
    }
  }

  update(zoneData, emergencyMode) {
    this.density = zoneData.density;
    this.status = zoneData.status;
    this.emergencyMode = emergencyMode;
    this.createParticles(Math.round(this.density * 200));
    
    // Update container border color based on status
    const container = this.canvas.parentElement;
    const colors = { ok: '#00E6A0', warning: '#FFD60A', danger: '#FF6030', critical: '#FF2255' };
    container.style.borderColor = colors[this.status] || '#222';
    
    // Update status pill
    const pill = container.querySelector('.cam-status-pill');
    pill.textContent = `STATUS: ${this.status.toUpperCase()}`;
    pill.style.background = colors[this.status];
    pill.style.color = (this.status === 'warning' || this.status === 'ok') ? '#000' : '#fff';

    // Toggle emergency overlay
    const evac = container.querySelector('.evac-overlay');
    evac.classList.toggle('active', this.emergencyMode);
  }

  draw() {
    const ctx = this.ctx;
    
    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle Fisheye Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const segments = 12;
    
    // Vertical arcs
    for (let i = 1; i < segments; i++) {
      const x = (i / segments) * this.width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(this.width/2 + (x - this.width/2) * 1.2, this.height/2, x, this.height);
      ctx.stroke();
    }
    // Horizontal arcs
    for (let i = 1; i < segments; i++) {
      const y = (i / segments) * this.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(this.width/2, this.height/2 + (y - this.height/2) * 1.2, this.width, y);
      ctx.stroke();
    }

    // Particles (Crowd)
    ctx.fillStyle = this.emergencyMode ? 'rgba(255, 34, 85, 0.6)' : 'rgba(255, 255, 255, 0.4)';
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      // Bounce
      if (p.x < 0 || p.x > this.width) p.vx *= -1;
      if (p.y < 0 || p.y > this.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Grain/Noise effect
    if (Math.random() > 0.9) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let i = 0; i < 20; i++) {
        ctx.fillRect(Math.random() * this.width, Math.random() * this.height, 1, 1);
      }
    }
  }

  animate() {
    this.draw();
    requestAnimationFrame(() => this.animate());
  }
}

// ── Initialization ──────────────────────────────────────────────────────────

const feeds = [
  new CCTVFeed('feed-north', 'north'),
  new CCTVFeed('feed-east', 'east'),
  new CCTVFeed('feed-south', 'south'),
  new CCTVFeed('feed-west', 'west'),
];

function updateTimestamps() {
  const now = new Date();
  const tsStr = now.toISOString().replace('T', ' ').split('.')[0];
  document.querySelectorAll('.mon-timestamp').forEach(el => el.textContent = tsStr);
}
setInterval(updateTimestamps, 1000);

// ── Bridge Integration ──────────────────────────────────────────────────────
if (window.FlowBridge) {
  window.FlowBridge.onState((state) => {
    feeds.forEach(feed => {
      const zoneData = state.zones[feed.zoneId];
      if (zoneData) {
        feed.update(zoneData, state.emergencyMode);
      }
    });
  });
}
