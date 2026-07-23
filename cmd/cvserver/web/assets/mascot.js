'use strict';

/* ============================================================
   BYTE — pixel mascot (vanilla port of Карабас.dc).
   Descends slowly down the right side of the page, tied to scroll
   progress: its vertical position tracks how far you've scrolled, so
   it drifts down as you read and back up when you scroll up. Stays in
   the right gutter, never over content. Smoothly eased, no wandering.
   Blinks, waves, hearts on click. Sprite drawing is the original BYTE.
   ============================================================ */

(function () {
  if (matchMedia('(max-width: 720px)').matches) return;      // too narrow on mobile
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ACCENT = '#2563eb';                                  // matches site brand
  // BYTE definition, verbatim from the original mascot.
  const DEF = {
    id: 'byte', scale: 1.5, eyeRange: 1.3, foot: 8,
    pal: { body: '#3b6bff', shade: '#2f5cff', dark: '#0d1b3d', glint: '#eaf1ff', blush: '#a9c2ff' }
  };
  // Gentle follow. Low k = slow, heavy ease so it lags the scroll softly.
  const EN = { k: 0.045, damp: 0.86 };
  const MARGIN = 46;                        // px from the right edge

  class Mascot {
    constructor(canvas) {
      this.canvas = canvas;
      this.pos = { x: 0, y: 0 };
      this.vel = { x: 0, y: 0 };
      this.eye = { x: 0, y: 0 };
      this.blink = 0; this.blinking = 0; this.blinkTimer = 1.4;
      this.breath = 0; this.tailPhase = 0; this.caretT = 0; this.caretOn = true;
      this.hop = 0; this.spin = 0;
      this.waving = 0; this.wavePhase = 0;
      this.moodStr = 'idle'; this.moodT = 0; this.dizzyCool = 0;
      this.particles = [];
      this.targetX = 0; this.targetY = 0;   // eased goal from scroll progress
      this.mounted = false; this.lastTS = 0;
    }

    _px() { return 5; }                                       // fixed sprite pixel size

    boot() {
      this.mounted = true;
      this._resize();
      this._md = (e) => { const t = e.touches && e.touches[0]; this._onClick(t ? t.clientX : e.clientX, t ? t.clientY : e.clientY); };
      this._rs = () => { this._resize(); };
      addEventListener('mousedown', this._md);
      addEventListener('resize', this._rs);

      this._computeTarget();
      // start already at its scroll position (no fly-in from the middle)
      this.pos.x = this.targetX; this.pos.y = this.targetY;
      this._startWave(1.6);
      this.lastTS = performance.now();
      this.raf = requestAnimationFrame(this._tick);
    }

    // Map scroll progress → vertical position; hold to the right gutter.
    _computeTarget() {
      const doc = document.documentElement;
      const max = Math.max(1, (doc.scrollHeight || 0) - innerHeight);
      const p = Math.max(0, Math.min(1, scrollY / max));      // 0 top … 1 bottom
      const top = 150, bot = innerHeight - 90;                // travel band (below the nav)
      this.targetY = top + (bot - top) * p;
      this.targetX = innerWidth - MARGIN;
    }

    _resize() {
      const c = this.canvas;
      const dpr = Math.min(2, devicePixelRatio || 1);
      c.width = Math.floor(innerWidth * dpr);
      c.height = Math.floor(innerHeight * dpr);
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      this.ctx = ctx;
    }

    _onClick() {
      this.moodStr = 'happy'; this.moodT = Math.max(this.moodT, 0.6); this.hop = 1;
      for (let i = 0; i < 6; i++) this.particles.push({ type: 'heart', x: this.pos.x + (Math.random() * 22 - 11), y: this.pos.y - 4, vx: (Math.random() * 44 - 22), vy: -32 - Math.random() * 34, life: 1.1, max: 1.1, c: ACCENT });
    }
    _startWave(sec) { this.waving = Math.max(this.waving, sec); this.wavePhase = 0; }

    _tick = (ts) => {
      if (!this.mounted) return;
      const dt = Math.min(0.05, ((ts - this.lastTS) / 1000) || 0); this.lastTS = ts;
      this._update(dt); this._render();
      this.raf = requestAnimationFrame(this._tick);
    };

    _update(dt) {
      this.breath += dt * 1.6;
      this.tailPhase += dt * 2.2;
      this.caretT += dt; this.caretOn = (this.caretT % 1.06) < 0.62;

      this.blinkTimer -= dt;
      if (this.blinking > 0) { this.blinking -= dt; this.blink = Math.sin((1 - this.blinking / 0.16) * Math.PI); } else this.blink = 0;
      if (this.blinkTimer <= 0) { this.blinking = 0.16; this.blinkTimer = 2.2 + Math.random() * 2.8; }

      if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 2.6);
      if (this.waving > 0) { this.waving -= dt; this.wavePhase += dt * 7; }
      if (this.moodT > 0) this.moodT -= dt;
      if (this.dizzyCool > 0) this.dizzyCool -= dt;
      this.spin += (0 - this.spin) * Math.min(1, dt * 4); if (Math.abs(this.spin) < 0.01) this.spin = 0;

      // recompute scroll-driven target, then ease slowly toward it
      this._computeTarget();
      const ty = this.targetY + Math.sin(this.breath) * 4;     // tiny idle bob
      this.vel.x = (this.vel.x + (this.targetX - this.pos.x) * EN.k) * EN.damp;
      this.vel.y = (this.vel.y + (ty - this.pos.y) * EN.k) * EN.damp;
      this.pos.x += this.vel.x; this.pos.y += this.vel.y;

      // eyes look toward travel direction (mostly vertical)
      const ety = Math.max(-1, Math.min(1, this.vel.y / 4));
      this.eye.x += (0 - this.eye.x) * Math.min(1, dt * 9);
      this.eye.y += (ety - this.eye.y) * Math.min(1, dt * 9);

      for (const p of this.particles) {
        p.life -= dt;
        if (p.type === 'heart') { p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; }
        else if (p.type === 'z') { p.x += p.vx * dt; p.y += p.vy * dt; }
        else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; }
      }
      this.particles = this.particles.filter((p) => p.life > 0);
    }

    _buildS() {
      const happy = (this.moodT > 0) || this.waving > 0 || this.hop > 0.4;
      return {
        eye: { x: this.eye.x * DEF.eyeRange, y: this.eye.y * DEF.eyeRange },
        blink: this.blink,
        hop: this.hop, spin: this.spin,
        tilt: this.waving > 0 ? Math.sin(this.wavePhase) * 0.12 : 0,
        armUp: this.waving > 0 ? (Math.sin(this.wavePhase) * 0.5 + 0.5) : 0.06,
        caret: this.caretOn, sleeping: false, accent: ACCENT, tail: this.tailPhase, happy,
        mouth: happy ? 'smile' : 'neutral'
      };
    }

    _render() {
      const ctx = this.ctx; if (!ctx) return;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const px = this._px();
      const foot = (DEF.foot || 8) * px * DEF.scale;
      const hopS = Math.sin(Math.max(0, this.hop) * Math.PI);
      ctx.save(); ctx.globalAlpha = 0.13 * (1 - hopS * 0.5); ctx.fillStyle = '#1f2a50';
      ctx.beginPath(); ctx.ellipse(this.pos.x, this.pos.y + foot + 4, foot * 0.7 * (1 - hopS * 0.25), foot * 0.22, 0, 0, 7); ctx.fill(); ctx.restore();
      const s = this._buildS();
      this._drawSprite(ctx, this.pos.x, this.pos.y, px, s);
      this._drawParticles(ctx);
    }

    _drawSprite(ctx, cx, cy, basePx, s) {
      const px = basePx * DEF.scale;
      const hopS = Math.sin(Math.max(0, s.hop) * Math.PI);
      const sx = 1 - Math.sin(this.breath) * 0.03 - hopS * 0.06;
      const sy = 1 + Math.sin(this.breath) * 0.03 + hopS * 0.12;
      const ox = Math.round(cx), oy = Math.round(cy - hopS * px * 3.2);
      ctx.save();
      const rot = (s.spin || 0) + (s.tilt || 0);
      if (rot) { ctx.translate(ox, oy); ctx.rotate(rot); ctx.translate(-ox, -oy); }
      const P = (gx, gy, w, h, c, a) => {
        if (!c) return;
        ctx.globalAlpha = (a == null ? 1 : a); ctx.fillStyle = c;
        const X = Math.round(ox + gx * px * sx), Y = Math.round(oy + gy * px * sy);
        ctx.fillRect(X, Y, Math.max(1, Math.ceil(w * px * sx)), Math.max(1, Math.ceil(h * px * sy)));
        ctx.globalAlpha = 1;
      };
      this._drawByte(P, DEF.pal, s);
      ctx.restore();
    }

    _eyes(P, pal, cfg, s) {
      const ex = s.eye.x, ey = s.eye.y, bl = s.blink;
      const ew = cfg.ew, eh = Math.max(0.7, cfg.eh * (1 - bl * 0.82));
      [-cfg.dx, cfg.dx].forEach((bx) => {
        const cxp = bx + ex, cyp = cfg.y + ey;
        P(cxp - ew / 2, cyp - eh / 2, ew, eh, pal.dark);
        if (bl < 0.5) P(cxp - ew / 2 + 0.2, cyp - eh / 2 + 0.2, 0.9, 0.9, pal.glint);
      });
    }
    _mouth(P, pal, s, cy) {
      if (s.mouth === 'sleep') { P(-1.4, cy, 2.8, 0.9, pal.dark); }
      else if (s.mouth === 'smile') { P(-2, cy, 4, 1, pal.dark); P(-2.7, cy - 0.8, 1, 1, pal.dark); P(1.7, cy - 0.8, 1, 1, pal.dark); }
      else P(-0.8, cy, 1.8, 0.9, pal.dark);
    }
    _drawByte(P, pal, s) {
      const spans = [[-7, -3, 3], [-6, -5, 5], [-5, -6, 6], [-4, -7, 7], [-3, -7, 7], [-2, -7, 7], [-1, -7, 7], [0, -7, 7], [1, -7, 7], [2, -7, 7], [3, -7, 7], [4, -6, 6], [5, -6, 6], [6, -4, 4], [7, -3, 3]];
      spans.forEach((r) => P(r[1], r[0], r[2] - r[1] + 1, 1, r[0] >= 4 ? pal.shade : pal.body));
      if (s.caret) P(-0.8, -11, 1.6, 3.2, s.accent, s.sleeping ? 0.25 : 1);
      if (s.happy) { P(-5.7, 1.4, 1.4, 1.2, pal.blush, 0.8); P(4.3, 1.4, 1.4, 1.2, pal.blush, 0.8); }
      this._eyes(P, pal, { dx: 3, y: -1, ew: 2.6, eh: 3.6 }, s);
      this._mouth(P, pal, s, 3);
      P(-8.4, 0.5, 1.8, 3, pal.shade);
      const ay = 0.5 - s.armUp * 4.2; P(6.6, ay, 1.8, 3, pal.shade); P(7.4, ay - 1, 1.8, 1.8, pal.body);
      P(-3.6, 7.2, 2.4, 1.4, pal.shade); P(1.2, 7.2, 2.4, 1.4, pal.shade);
    }

    _heart(ctx, x, y, s, a, c) {
      ctx.globalAlpha = a; ctx.fillStyle = c || ACCENT;
      [[-1, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]].forEach((p) => ctx.fillRect(Math.round(x + p[0] * s), Math.round(y + p[1] * s), Math.ceil(s), Math.ceil(s)));
      ctx.globalAlpha = 1;
    }
    _zed(ctx, x, y, s, a) {
      ctx.globalAlpha = a; ctx.fillStyle = '#aab2ba';
      [[-1, -1], [0, -1], [1, -1], [0, 0], [-1, 1], [0, 1], [1, 1]].forEach((p) => ctx.fillRect(Math.round(x + p[0] * s), Math.round(y + p[1] * s), Math.ceil(s), Math.ceil(s)));
      ctx.globalAlpha = 1;
    }
    _drawParticles(ctx) {
      for (const p of this.particles) {
        const a = Math.max(0, p.life / p.max);
        if (p.type === 'heart') this._heart(ctx, p.x, p.y, 3, a, p.c);
        else if (p.type === 'z') this._zed(ctx, p.x, p.y, 3, a);
        else { ctx.globalAlpha = a; ctx.fillStyle = p.c || ACCENT; ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3); ctx.globalAlpha = 1; }
      }
    }
  }

  function initMascot() {
    const c = document.getElementById('mascot');
    if (!c) return;
    new Mascot(c).boot();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMascot);
  else initMascot();
})();
