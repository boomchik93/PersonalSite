'use strict';

/* ============================================================
   Semenov.dc — light redesign, production front-end.
   Content is pulled from the Go backend (/api/site, /api/spotify/*,
   /api/contact). The retro workstation (FBX) and Rubik's cube are
   rendered with Three.js r128.
   ============================================================ */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function $(id) { return document.getElementById(id); }
function setText(id, v) { const el = $(id); if (el && v != null && v !== '') el.textContent = v; }

/* ---------- Nav / menu / fades ---------- */

function initNav() {
  const nav = $('siteNav');
  if (nav) {
    const apply = () => {
      const on = scrollY > 24;
      nav.style.background = on ? 'rgba(246,247,249,.82)' : 'transparent';
      nav.style.backdropFilter = on ? 'blur(18px) saturate(160%)' : 'none';
      nav.style.webkitBackdropFilter = on ? 'blur(18px) saturate(160%)' : 'none';
      nav.style.boxShadow = on ? '0 1px 0 rgba(20,22,28,.06)' : 'none';
    };
    apply();
    addEventListener('scroll', apply, { passive: true });
  }
  const burger = $('burger-btn');
  const menu = $('mobile-menu-wrap');
  if (burger && menu) {
    let open = false;
    const setMenu = (v) => { open = v; menu.style.maxHeight = v ? '340px' : '0px'; };
    burger.addEventListener('click', () => setMenu(!open));
    document.querySelectorAll('[data-close-menu]').forEach((a) =>
      a.addEventListener('click', () => setMenu(false)));
  }
}

function initFades() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = document.querySelectorAll('.fade:not(.vis)');
  if (reduced) { els.forEach((el) => el.classList.add('vis')); return; }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('vis'); obs.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach((el) => obs.observe(el));
}

function initProjectHover() {
  document.querySelectorAll('.proj').forEach((card) => {
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-6px)';
      card.style.boxShadow = '0 30px 50px -34px rgba(37,99,235,.5)';
      card.style.borderColor = '#c9d6fb';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'none';
      card.style.boxShadow = '0 0 0 rgba(0,0,0,0)';
      card.style.borderColor = '#e7e9ee';
    });
  });
}

/* ---------- Content from /api/site ---------- */

// skill highlight → design's three-tier pill styles
const PILL = {
  main: 'display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:11px;background:#2563eb;color:#fff;font-weight:500;font-size:14px',
  strong: 'display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:11px;background:rgba(37,99,235,.1);color:#1d4ed8;font-weight:500;font-size:14px',
  work: 'display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:11px;background:#f0f2f6;color:#4b515c;font-weight:500;font-size:14px',
};
const TIER_TAG = "font-family:'JetBrains Mono',monospace;font-size:10px;opacity:.8";

function renderSite(data) {
  const p = data.profile || {};

  // hero
  setText('hero-first', p.first_name);
  setText('hero-last', p.last_name);
  if (p.tagline) setText('hero-kicker', '// ' + p.tagline.toLowerCase() + ' · ' + (p.location || '').split('/')[0].trim());
  if (p.about_ru) setText('hero-desc', p.about_ru.split('.').slice(0, 2).join('.') + '.');
  if (p.telegram) {
    const tg = $('hero-tg');
    if (tg) { tg.href = 'https://t.me/' + p.telegram; tg.textContent = '✈ @' + p.telegram; }
  }
  const photo = $('hero-photo');
  if (photo && p.photo) { photo.src = p.photo; }

  document.title = `${p.first_name || ''} ${p.last_name || ''} — Разработчик`.trim();

  // about overlay text
  if (p.about_ru) setText('about-text', p.about_ru);

  // rubik / interests block copy (editable in admin)
  setText('rubik-label', p.rubik_label);
  setText('rubik-title', p.rubik_title);
  setText('rubik-text', p.rubik_text);

  // skills grid — one card per group
  const skills = data.skills || [];
  if (skills.length && $('skills-grid')) {
    $('skills-grid').innerHTML = skills.map((g) => {
      const pills = (g.skills || []).map((s, i) => {
        // level: main | strong | work. Empty falls back to legacy highlight logic
        // (first highlighted in group = main, other highlighted = strong).
        let level = s.level;
        if (!level) level = s.highlight ? (i === 0 ? 'main' : 'strong') : 'work';
        const style = level === 'main' ? PILL.main : level === 'strong' ? PILL.strong : PILL.work;
        const label = level === 'main' ? 'основной' : level === 'strong' ? 'уверенно' : '';
        const tag = label ? `<span style="${TIER_TAG}">${label}</span>` : '';
        return `<span style="${style}">${esc(s.name)}${tag}</span>`;
      }).join('');
      return `<div class="fade vis" style="background:#fff;border:1px solid #e7e9ee;border-radius:18px;padding:24px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#9aa0ab;margin-bottom:18px">// ${esc(g.title)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:9px">${pills}</div>
      </div>`;
    }).join('');
  }

  // interests list
  const interests = data.interests || [];
  if (interests.length && $('interests-list')) {
    const icons = ['♪', '❦', '◉', '⚙'];
    $('interests-list').innerHTML = interests.map((it, i) => `
      <div style="display:flex;gap:16px;align-items:flex-start;background:#fff;border:1px solid #e7e9ee;border-radius:16px;padding:18px 20px">
        <span style="font-size:26px;color:#2563eb;line-height:1">${esc(it.symbol || icons[i % icons.length])}</span>
        <div><h3 style="font-size:18px;font-weight:600;margin-bottom:3px">${esc(it.title)}</h3>
        <p style="color:#626873;line-height:1.5;font-size:15px">${esc(it.description || it.subtitle || '')}</p></div>
      </div>`).join('');
  }

  // education card — first entry (design has a single card)
  const edu = (data.education || [])[0];
  if (edu && $('edu-card')) {
    $('edu-card').innerHTML = `
      <div style="display:flex;gap:26px;align-items:flex-start">
        <img src="/assets/hse-perm.png" alt="НИУ ВШЭ — Пермь" width="96" height="96"
          style="flex:0 0 96px;width:96px;height:96px;object-fit:contain">
        <div style="flex:1 1 auto;min-width:0">
          <div style="font-family:'JetBrains Mono',monospace;font-size:14px;color:#2563eb;white-space:nowrap">${esc(edu.period)}</div>
          <h3 style="font-size:22px;font-weight:600;margin:6px 0">${esc(edu.institution)}</h3>
          <div style="color:#626873;margin-bottom:12px">${esc(edu.major)}</div>
          ${edu.description ? `<p style="color:#626873;line-height:1.6">${esc(edu.description)}</p>` : ''}
        </div>
      </div>`;
  }

  // projects grid
  const projects = data.projects || [];
  if (projects.length && $('projects-grid')) {
    $('projects-grid').innerHTML = projects.map((pr, i) => {
      const stackParts = (pr.stack || '').split('·').map((s) => s.trim()).filter(Boolean);
      const tag = stackParts.slice(0, 2).join(' · ') || 'Project';
      const href = pr.url ? esc(pr.url) : '#';
      return `<a href="${href}" ${pr.url ? 'target="_blank" rel="noopener"' : ''} class="proj" style="display:block;background:#fff;border:1px solid #e7e9ee;border-radius:20px;padding:28px;transition:transform .35s cubic-bezier(.22,.61,.36,1),box-shadow .35s;box-shadow:0 0 0 rgba(0,0,0,0)">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:60px">
          <span style="font-family:'JetBrains Mono',monospace;font-size:12px;padding:6px 11px;border-radius:8px;background:rgba(37,99,235,.09);color:#2563eb">${esc(tag)}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#c3c8d1">${String(i + 1).padStart(2, '0')}</span>
        </div>
        <h3 style="font-size:24px;font-weight:600;margin-bottom:8px">${esc(pr.title)}</h3>
        ${pr.metrics ? `<div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#2563eb;margin-bottom:10px">${esc(pr.metrics)}</div>` : ''}
        <p style="color:#626873;line-height:1.55;margin-bottom:18px">${esc(pr.description)}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#9aa0ab">
          ${stackParts.map((s) => `<span>${esc(s)}</span>`).join('<span>·</span>')}
        </div>
      </a>`;
    }).join('');
    initProjectHover();
  }

  // contacts
  if (p.telegram) {
    const a = $('contact-tg'); if (a) a.href = 'https://t.me/' + p.telegram;
    setText('contact-tg-h', '@' + p.telegram);
  }
  if (p.email) {
    const a = $('contact-email'); if (a) a.href = 'mailto:' + p.email;
    setText('contact-email-h', p.email);
  }
  if (p.resume) { const r = $('resume-link'); if (r) r.href = p.resume; }

  initFades();
}

/* ---------- Contact form ---------- */

function initForm() {
  const form = $('contact-form');
  if (!form) return;
  const status = $('cform-status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    const payload = {
      name: (fd.get('name') || '').trim(),
      email: (fd.get('email') || '').trim(),
      message: (fd.get('message') || '').trim(),
    };
    if (status) { status.style.color = '#626873'; status.textContent = 'Отправка…'; }
    if (btn) btn.disabled = true;
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (status) { status.style.color = '#22a55b'; status.textContent = 'Спасибо! Сообщение отправлено.'; }
        form.reset();
      } else if (status) {
        status.style.color = '#e0245e'; status.textContent = data.error || 'Не удалось отправить.';
      }
    } catch (_) {
      if (status) { status.style.color = '#e0245e'; status.textContent = 'Ошибка сети. Попробуйте позже.'; }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

/* ---------- Music (Spotify) ---------- */

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function monthLabel(m) {
  if (!m) return '// топ за месяц';
  const [y, mm] = m.split('-').map(Number);
  return `// топ за ${MONTHS[mm - 1]} ${y}`;
}
function fmtMs(ms) {
  const t = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const EQ_BARS = Array.from({ length: 7 }, (_, i) =>
  `<span style="flex:1;background:#2563eb;border-radius:3px;height:100%;transform-origin:bottom;animation:eq .9s ease-in-out infinite;animation-delay:${(i * 0.15).toFixed(2)}s"></span>`).join('');

async function loadNow() {
  const el = $('music-now');
  if (!el) return;
  try {
    const np = await (await fetch('/api/spotify/now')).json();
    const head = `<div style="display:flex;align-items:center;gap:9px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#9fb4ff;margin-bottom:24px"><span style="width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.25)"></span>now playing · spotify</div>`;
    if (!np.is_playing) {
      el.innerHTML = head + `<div style="display:flex;gap:16px;align-items:center;margin-bottom:22px">
        <div style="width:72px;height:72px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#4f46e5);display:grid;place-items:center;font-size:26px;flex:none">♫</div>
        <div style="min-width:0"><div style="font-size:18px;font-weight:600;margin-bottom:4px">Сейчас тихо</div><div style="color:#a7adba">ничего не играет</div></div></div>`;
      return;
    }
    const pct = np.duration_ms ? Math.min(100, (np.progress_ms / np.duration_ms) * 100) : 0;
    el.innerHTML = head + `
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:22px">
        <div style="width:72px;height:72px;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,#2563eb,#4f46e5);display:grid;place-items:center;font-size:26px;flex:none">${np.image_url ? `<img src="${esc(np.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '♫'}</div>
        <div style="min-width:0"><div style="font-size:18px;font-weight:600;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(np.track_name)}</div><div style="color:#a7adba">${esc(np.artist_name)}</div></div>
      </div>
      <div style="height:5px;border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden;margin-bottom:8px"><div style="width:${pct.toFixed(1)}%;height:100%;background:#2563eb"></div></div>
      <div style="display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:12px;color:#8f96a5;margin-bottom:22px"><span>${fmtMs(np.progress_ms)}</span><span>${fmtMs(np.duration_ms)}</span></div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:34px">${EQ_BARS}</div>
      ${np.track_url ? `<a href="${esc(np.track_url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:18px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#9fb4ff">Слушать →</a>` : ''}`;
  } catch (_) { /* keep static */ }
}

async function loadTop() {
  const list = $('music-tracks');
  if (!list) return;
  try {
    const data = await (await fetch('/api/spotify/top')).json();
    const tracks = data.tracks || [];
    setText('music-top-label', monthLabel(data.month));
    if (!tracks.length) return;
    list.innerHTML = tracks.slice(0, 6).map((it, i) => {
      const last = i === Math.min(tracks.length, 6) - 1;
      return `<div style="display:flex;align-items:center;gap:14px;padding:12px 0;${last ? '' : 'border-bottom:1px solid #eceef2'}">
        <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#2563eb;width:20px">${i + 1}</span>
        <span style="width:42px;height:42px;border-radius:9px;overflow:hidden;background:#eef1f8;display:grid;place-items:center;color:#2563eb;flex:none">${it.image_url ? `<img src="${esc(it.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '♪'}</span>
        <span style="flex:1;min-width:0"><span style="display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.track_name)}</span><span style="display:block;color:#9aa0ab;font-size:13px">${esc(it.artist_name)}</span></span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#9aa0ab">${it.play_count}×</span></div>`;
    }).join('');
  } catch (_) { /* keep static */ }
}

/* ============================================================
   3D — retro workstation (FBX) + Rubik's cube
   Ported from the design export; Rubik + fallback improved.
   ============================================================ */

class Retro3D {
  constructor() {
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mouse = { x: 0.5, y: 0.5 };
    this._cleanup = [];
    addEventListener('mousemove', (e) => { this.mouse = { x: e.clientX / innerWidth, y: e.clientY / innerHeight }; }, { passive: true });
  }

  _roundedBox(T, w, h, d, r) {
    r = Math.min(r, w / 2, h / 2, d / 2);
    const sh = new T.Shape(), x = -w / 2, y = -h / 2;
    sh.moveTo(x + r, y);
    sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
    sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
    sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
    const geo = new T.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 4, curveSegments: 10 });
    geo.center();
    return geo;
  }

  /* ---- Rubik: flush uniform cubies, flat vivid stickers ---- */
  _makeRubik(T) {
    const group = new T.Group();
    const cubeRoot = new T.Group(); group.add(cubeRoot);
    // standard Rubik colours
    const cols = { r: 0xc41e3a, l: 0xff5800, u: 0xf5f5f5, d: 0xffd500, f: 0x0051ba, b: 0x009e60 };
    const s = 0.64;              // cubie body size
    const step = 0.66;          // spacing ≈ body + thin seam → flush, no gaps
    const off = s / 2 + 0.012;  // sticker sits just proud of the face
    const bodyGeo = new T.BoxGeometry(s, s, s);  // simple cube → tight, uniform, no bevel size drift
    const bodyMat = new T.MeshStandardMaterial({ color: 0x101014, roughness: 0.5, metalness: 0.0 });
    // thin flat sticker tile, identical size on every face
    const st_face = s * 0.86, st_thick = 0.02;
    const geoZ = new T.BoxGeometry(st_face, st_face, st_thick); // for ±Z faces
    const geoX = new T.BoxGeometry(st_thick, st_face, st_face); // for ±X faces
    const geoY = new T.BoxGeometry(st_face, st_thick, st_face); // for ±Y faces
    const stickerMat = (c) => new T.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.0 });
    const cubies = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const c = new T.Group();
      c.add(new T.Mesh(bodyGeo, bodyMat));
      const add = (nx, ny, nz, col) => {
        const geo = nx ? geoX : (ny ? geoY : geoZ);
        const st = new T.Mesh(geo, stickerMat(col));
        st.position.set(nx * off, ny * off, nz * off);
        c.add(st);
      };
      if (x === 1) add(1, 0, 0, cols.r); if (x === -1) add(-1, 0, 0, cols.l);
      if (y === 1) add(0, 1, 0, cols.u); if (y === -1) add(0, -1, 0, cols.d);
      if (z === 1) add(0, 0, 1, cols.f); if (z === -1) add(0, 0, -1, cols.b);
      c.position.set(x * step, y * step, z * step);
      c.userData.home = c.position.clone();
      cubeRoot.add(c); cubies.push(c);
    }
    group.scale.setScalar(0.92);

    const axes = { x: new T.Vector3(1, 0, 0), y: new T.Vector3(0, 1, 0), z: new T.Vector3(0, 0, 1) };
    const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    let phase = 'wait', timer = 0.5, turnsLeft = 12, pivot = null, mv = null, angle = 0, target = 0;
    let tw = null, twT = 0, twDur = 1;
    const speed = Math.PI / 2 / 0.3;
    const pick = () => ({ ax: ['x', 'y', 'z'][Math.floor(Math.random() * 3)], layer: [-1, 0, 1][Math.floor(Math.random() * 3)], dir: Math.random() < 0.5 ? 1 : -1 });
    const startMove = () => {
      mv = pick(); pivot = new T.Group(); cubeRoot.add(pivot);
      cubies.forEach((c) => { if (Math.round(c.position[mv.ax] / step) === mv.layer) pivot.attach(c); });
      angle = 0; target = mv.dir * Math.PI / 2;
    };
    const endMove = () => {
      pivot.setRotationFromAxisAngle(axes[mv.ax], target); pivot.updateMatrixWorld(true);
      [...pivot.children].forEach((c) => cubeRoot.attach(c));
      cubeRoot.remove(pivot); pivot = null;
      cubies.forEach((c) => c.position.set(Math.round(c.position.x / step) * step, Math.round(c.position.y / step) * step, Math.round(c.position.z / step) * step));
    };
    const beginExplode = () => {
      tw = cubies.map((c) => {
        const p0 = c.position.clone(), q0 = c.quaternion.clone();
        let dir = p0.clone(); if (dir.lengthSq() < 1e-3) dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        dir.normalize();
        const p1 = p0.clone().addScaledVector(dir, 1.1).multiplyScalar(1.06);
        const eq = new T.Quaternion().setFromEuler(new T.Euler((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4));
        return { c, p0, q0, p1, q1: q0.clone().multiply(eq) };
      });
      twT = 0; twDur = 0.75; phase = 'explode';
    };
    const beginGather = () => {
      tw = cubies.map((c) => ({ c, p0: c.position.clone(), q0: c.quaternion.clone(), p1: c.userData.home.clone(), q1: new T.Quaternion() }));
      twT = 0; twDur = 1.0; phase = 'gather';
    };
    const applyTween = (k) => { for (const e of tw) { e.c.position.lerpVectors(e.p0, e.p1, k); e.c.quaternion.copy(e.q0).slerp(e.q1, k); } };
    const update = (dt) => {
      if (phase === 'wait') { timer -= dt; if (timer <= 0) { if (turnsLeft > 0) { startMove(); phase = 'turn'; } else beginExplode(); } }
      else if (phase === 'turn') { angle += Math.sign(target) * speed * dt; if (Math.abs(angle) >= Math.abs(target)) { endMove(); turnsLeft--; phase = 'wait'; timer = 0.12 + Math.random() * 0.28; } else pivot.setRotationFromAxisAngle(axes[mv.ax], angle); }
      else if (phase === 'explode') { twT += dt; const e = Math.min(1, twT / twDur); applyTween(easeOut(e)); if (e >= 1) { phase = 'hold'; timer = 0.45; } }
      else if (phase === 'hold') { timer -= dt; if (timer <= 0) beginGather(); }
      else if (phase === 'gather') { twT += dt; const e = Math.min(1, twT / twDur); applyTween(easeInOut(e)); if (e >= 1) { cubies.forEach((c) => { c.position.copy(c.userData.home); c.quaternion.identity(); }); turnsLeft = 10 + Math.floor(Math.random() * 6); phase = 'wait'; timer = 0.8; } }
    };
    return { group, update };
  }

  /* ---- CRT screen texture (procedural fallback) ---- */
  _crtScreen(T) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 200;
    const x = c.getContext('2d');
    const draw = (t) => {
      x.clearRect(0, 0, 256, 200);
      let sky = x.createLinearGradient(0, 0, 0, 116); sky.addColorStop(0, '#190a34'); sky.addColorStop(1, '#4a1560');
      x.fillStyle = sky; x.fillRect(0, 0, 256, 116);
      const cx = 128, cy = 110, R = 42;
      x.save(); x.beginPath(); x.rect(0, 0, 256, 116); x.clip();
      let sun = x.createLinearGradient(0, cy - R, 0, cy + R); sun.addColorStop(0, '#ffe27a'); sun.addColorStop(0.5, '#ff7ac6'); sun.addColorStop(1, '#ff2f86');
      x.fillStyle = sun; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#2b0f47'; for (let i = 0; i < 7; i++) { const yy = cy + 3 + i * 5; x.fillRect(cx - R, yy, 2 * R, 2 + i * 0.4); }
      x.restore();
      let gr = x.createLinearGradient(0, 116, 0, 200); gr.addColorStop(0, '#0b0a20'); gr.addColorStop(1, '#170a30');
      x.fillStyle = gr; x.fillRect(0, 116, 256, 84);
      x.fillStyle = 'rgba(255,60,150,.55)'; x.fillRect(0, 114, 256, 3);
      x.strokeStyle = 'rgba(34,240,255,.7)'; x.lineWidth = 1;
      for (let i = 0; i < 14; i++) { const f = ((i + (t * 0.5) % 1) / 14); const yy = 117 + f * f * 83; x.globalAlpha = 0.15 + 0.6 * f; x.beginPath(); x.moveTo(0, yy); x.lineTo(256, yy); x.stroke(); }
      x.globalAlpha = 0.72;
      for (let i = -7; i <= 7; i++) { x.beginPath(); x.moveTo(128 + i * 5, 117); x.lineTo(128 + i * 40, 200); x.stroke(); }
      x.globalAlpha = 1;
      x.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < 200; y += 3) x.fillRect(0, y, 256, 1);
      x.fillStyle = 'rgba(120,80,200,' + (0.05 + 0.03 * Math.sin(t * 8)).toFixed(3) + ')'; x.fillRect(0, 0, 256, 200);
    };
    const texture = new T.CanvasTexture(c); texture.minFilter = T.LinearFilter;
    draw(0);
    return { texture, draw };
  }

  _floppyDisk(T) {
    const g = new T.Group();
    const shell = new T.MeshStandardMaterial({ color: 0x2b2f78, roughness: 0.5, metalness: 0.16 });
    g.add(new T.Mesh(this._roundedBox(T, 2, 2.06, 0.22, 0.08), shell));
    const corner = new T.Mesh(new T.BoxGeometry(0.32, 0.32, 0.24), shell); corner.position.set(0.86, 0.87, 0); corner.rotation.z = Math.PI / 4; g.add(corner);
    const shutter = new T.Mesh(this._roundedBox(T, 1.08, 0.74, 0.26, 0.05), new T.MeshStandardMaterial({ color: 0xccd0da, roughness: 0.22, metalness: 0.86 }));
    shutter.position.set(-0.02, 0.66, 0); g.add(shutter);
    const win = new T.Mesh(new T.BoxGeometry(0.52, 0.52, 0.3), new T.MeshStandardMaterial({ color: 0x14173a, roughness: 0.5 })); win.position.set(-0.16, 0.66, 0); g.add(win);
    const notch = new T.Mesh(new T.BoxGeometry(0.16, 0.52, 0.28), new T.MeshStandardMaterial({ color: 0x2a2d66 })); notch.position.set(0.36, 0.66, 0); g.add(notch);
    const label = new T.Mesh(this._roundedBox(T, 1.64, 1.0, 0.04, 0.05), new T.MeshStandardMaterial({ color: 0xf4f5f9, roughness: 0.9 })); label.position.set(0, -0.34, 0.115); g.add(label);
    const head = new T.Mesh(new T.BoxGeometry(1.64, 0.22, 0.02), new T.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.7 })); head.position.set(0, 0.02, 0.14); g.add(head);
    for (let i = 0; i < 3; i++) { const ln = new T.Mesh(new T.BoxGeometry(1.36, 0.05, 0.02), new T.MeshStandardMaterial({ color: 0xaab2cc })); ln.position.set(0, -0.28 - i * 0.2, 0.14); g.add(ln); }
    [-0.82, 0.82].forEach((dx) => { const h = new T.Mesh(new T.BoxGeometry(0.14, 0.14, 0.26), new T.MeshStandardMaterial({ color: 0x14173a })); h.position.set(dx, -0.92, 0); g.add(h); });
    const hub = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 0.06, 26), new T.MeshStandardMaterial({ color: 0xb7bac4, metalness: 0.75, roughness: 0.28 }));
    hub.rotation.x = Math.PI / 2; hub.position.set(0, 0.16, -0.13); g.add(hub);
    return g;
  }

  /* ---- procedural CRT workstation: sharper edges + more detail ---- */
  _makeCRT(T) {
    const g = new T.Group();
    const beige = new T.MeshStandardMaterial({ color: 0xe7dfcb, roughness: 0.66, metalness: 0.03 });
    const beigeD = new T.MeshStandardMaterial({ color: 0xccc1a8, roughness: 0.72, metalness: 0.03 });
    const beigeL = new T.MeshStandardMaterial({ color: 0xf1ebda, roughness: 0.6, metalness: 0.03 });
    const dark = new T.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.55, metalness: 0.15 });
    const graphite = new T.MeshStandardMaterial({ color: 0x33373f, roughness: 0.5, metalness: 0.2 });
    const bx = (w, h, d) => new T.BoxGeometry(w, h, d);

    // ---- monitor ----
    const mon = new T.Group();
    // main enclosure — sharp box with a small chamfer only
    mon.add(new T.Mesh(this._roundedBox(T, 2.24, 2.02, 1.85, 0.09), beige));
    // tapered CRT hump at the back
    const back = new T.Mesh(this._roundedBox(T, 1.55, 1.45, 0.85, 0.1), beigeD); back.position.set(0, 0.0, -1.2); mon.add(back);
    const backTip = new T.Mesh(this._roundedBox(T, 0.9, 0.85, 0.4, 0.08), beigeD); backTip.position.set(0, 0.0, -1.65); mon.add(backTip);
    // recessed front bezel (sharp), then a sunken screen well
    const bezel = new T.Mesh(this._roundedBox(T, 2.02, 1.78, 0.16, 0.07), beigeL); bezel.position.set(0, 0.05, 0.9); mon.add(bezel);
    const well = new T.Mesh(this._roundedBox(T, 1.66, 1.4, 0.12, 0.05), beigeD); well.position.set(0, 0.09, 0.97); mon.add(well);
    const frame = new T.Mesh(this._roundedBox(T, 1.52, 1.26, 0.1, 0.04), dark); frame.position.set(0, 0.09, 1.0); mon.add(frame);
    const scr = this._crtScreen(T);
    const screen = new T.Mesh(this._roundedBox(T, 1.4, 1.12, 0.04, 0.06), new T.MeshBasicMaterial({ map: scr.texture })); screen.position.set(0, 0.09, 1.03); mon.add(screen);
    const gloss = new T.Mesh(this._roundedBox(T, 1.4, 1.12, 0.02, 0.06), new T.MeshPhysicalMaterial({ color: 0x0a0f14, transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0, clearcoat: 1 })); gloss.position.set(0, 0.09, 1.06); mon.add(gloss);
    const glow = new T.PointLight(0x8b5cf6, 0.8, 4); glow.position.set(0, 0.1, 1.7); mon.add(glow);
    const glow2 = new T.PointLight(0x22d3ee, 0.45, 3.4); glow2.position.set(0, -0.2, 1.6); mon.add(glow2);
    // bottom control strip: brand plate + buttons + power LED
    const strip = new T.Mesh(bx(2.0, 0.24, 0.06), beigeL); strip.position.set(0, -0.82, 0.94); mon.add(strip);
    const badge = new T.Mesh(bx(0.5, 0.1, 0.03), graphite); badge.position.set(-0.72, -0.82, 0.99); mon.add(badge);
    [0.0, 0.16, 0.32].forEach((dx) => { const b = new T.Mesh(bx(0.1, 0.05, 0.04), beigeD); b.position.set(dx, -0.82, 0.99); mon.add(b); });
    const dial = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.05, 18), beigeD); dial.rotation.x = Math.PI / 2; dial.position.set(0.56, -0.82, 0.99); mon.add(dial);
    const led = new T.Mesh(new T.SphereGeometry(0.032, 16, 16), new T.MeshBasicMaterial({ color: 0x53ff8a })); led.position.set(0.78, -0.82, 0.99); mon.add(led);
    const ledGlow = new T.PointLight(0x53ff8a, 0.35, 1.2); ledGlow.position.copy(led.position); mon.add(ledGlow);
    // top + side ventilation grilles (many thin slots)
    for (let i = 0; i < 9; i++) { const vt = new T.Mesh(bx(1.4, 0.015, 0.055), beigeD); vt.position.set(0, 1.02, -0.5 + i * 0.13); mon.add(vt); }
    for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 7; i++) { const vt = new T.Mesh(bx(0.03, 0.7, 0.05), beigeD); vt.position.set(s * 1.13, 0.1, -0.35 + i * 0.12); mon.add(vt); }
    mon.position.set(0, 0.5, 0); mon.rotation.x = -0.06; g.add(mon);

    // ---- pedestal / tilt-swivel base ----
    const neck = new T.Mesh(new T.CylinderGeometry(0.3, 0.44, 0.2, 6), beigeD); neck.position.set(0, -0.64, 0.02); g.add(neck);
    const base = new T.Mesh(this._roundedBox(T, 1.9, 0.22, 1.5, 0.08), beige); base.position.set(0, -0.82, 0.05); g.add(base);
    const baseLip = new T.Mesh(this._roundedBox(T, 1.7, 0.06, 1.3, 0.05), beigeD); baseLip.position.set(0, -0.7, 0.05); g.add(baseLip);

    // ---- horizontal desktop case under/behind (implied tower) : floppy + drive bays ----
    const caseBox = new T.Mesh(this._roundedBox(T, 2.0, 0.42, 1.35, 0.06), beige); caseBox.position.set(0, -1.12, -0.1); g.add(caseBox);
    const bay = new T.Mesh(bx(0.7, 0.12, 0.04), dark); bay.position.set(0.45, -1.06, 0.58); g.add(bay);
    const floppy = new T.Mesh(bx(0.6, 0.04, 0.03), graphite); floppy.position.set(0.45, -1.16, 0.59); g.add(floppy);
    const eject = new T.Mesh(bx(0.06, 0.04, 0.04), beigeL); eject.position.set(0.72, -1.18, 0.59); g.add(eject);
    for (let i = 0; i < 4; i++) { const sl = new T.Mesh(bx(0.5, 0.012, 0.03), beigeD); sl.position.set(-0.5, -1.02 - i * 0.05, 0.58); g.add(sl); }
    const pwr = new T.Mesh(new T.SphereGeometry(0.028, 14, 14), new T.MeshBasicMaterial({ color: 0x53ff8a })); pwr.position.set(-0.82, -1.1, 0.59); g.add(pwr);
    const pwrGlow = new T.PointLight(0x53ff8a, 0.25, 1.0); pwrGlow.position.copy(pwr.position); g.add(pwrGlow);

    g.scale.setScalar(1.0);
    let t = 0;
    const update = (dt) => { t += dt; scr.draw(t); scr.texture.needsUpdate = true; ledGlow.intensity = 0.28 + 0.14 * Math.sin(t * 3); };
    return { group: g, update };
  }

  /* ---- computer: clean procedural CRT workstation (self-contained, no
     texture glitches, sits in the upper part of the slot so it never
     overlaps the caption text below) ---- */
  _loadComputer(T, group) {
    const crt = this._makeCRT(T);
    // auto-fit the whole workstation to a fixed target size (like the FBX
    // path did) so framing is predictable at the slot's camera distance,
    // then lift it into the upper region so it clears the caption below.
    const box = new T.Box3().setFromObject(crt.group);
    const size = new T.Vector3(); box.getSize(size);
    const center = new T.Vector3(); box.getCenter(center);
    const maxd = Math.max(size.x, size.y, size.z) || 1;
    const s = 1.67 / maxd;   // ~1.5× smaller than before so the whole rig fits
    const holder = new T.Group();
    crt.group.scale.setScalar(s);
    // center, lift above caption, shift right so it clears the text column
    crt.group.position.set(-center.x * s + 1.15, -center.y * s - 0.25, -center.z * s);
    holder.add(crt.group);
    group.add(holder);
    return { ready: true, update: crt.update };
  }

  _loadComputerFBX(T, group) {
    // legacy FBX path — kept for reference, no longer used
    const state = { screenMat: null, ready: false, update: (dt, now) => { if (state.screenMat) state.screenMat.emissiveIntensity = 0.85 + 0.12 * Math.sin(now * 3); } };
    const base = '/uploads/old-computer/';
    const tl = new T.TextureLoader();
    const tex = (p, srgb) => { const t = tl.load('/uploads/' + p); if (srgb) t.encoding = T.sRGBEncoding; return t; };
    const mat = new T.MeshStandardMaterial({
      map: tex('Old_Computer_BaseColor.png', true),
      normalMap: tex('Old_Computer_Normal.png'),
      roughnessMap: tex('Old_Computer_Roughness.png'),
      metalnessMap: tex('Old_Computer_Metalness.png'),
      aoMap: tex('Old_Computer_AO.png'),
      metalness: 1, roughness: 1,
    });
    state.screenMat = mat;
    const fallback = () => { const crt = this._makeCRT(T); group.add(crt.group); state.update = crt.update; state.ready = true; };
    const finalize = (obj) => {
      obj.traverse((c) => {
        if (c.isMesh) {
          c.material = mat;
          const gm = c.geometry;
          if (gm && gm.attributes.uv && !gm.attributes.uv2) gm.setAttribute('uv2', new T.BufferAttribute(gm.attributes.uv.array, 2));
        }
      });
      const box = new T.Box3().setFromObject(obj);
      const size = new T.Vector3(); box.getSize(size);
      const center = new T.Vector3(); box.getCenter(center);
      const maxd = Math.max(size.x, size.y, size.z) || 1;
      const s = 2.7 / maxd;
      obj.scale.setScalar(s);
      obj.position.set(-center.x * s, -center.y * s, -center.z * s);
      const holder = new T.Group(); holder.add(obj); group.add(holder);
      state.ready = true;
    };
    if (!T.FBXLoader) { fallback(); return state; }
    try {
      new T.FBXLoader().load(base + 'source/Old-Computer.fbx', finalize, undefined, fallback);
    } catch (_) { fallback(); }
    return state;
  }

  _mkScene(T, grp) {
    const s = new T.Scene();
    s.add(grp);
    s.add(new T.AmbientLight(0xffffff, 0.42));
    s.add(new T.HemisphereLight(0xffffff, 0xd4dae6, 0.4));
    const key = new T.DirectionalLight(0xffffff, 1.05); key.position.set(4, 7, 6); s.add(key);
    const fill = new T.DirectionalLight(0xffffff, 0.35); fill.position.set(-6, 2, 4); s.add(fill);
    const rim = new T.DirectionalLight(0xffffff, 0.55); rim.position.set(-3, 4, -6); s.add(rim);
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 100);
    return { scene: s, cam, grp };
  }

  init() {
    const T = window.THREE;
    const cv = $('retroGl');
    if (!cv || !T) return;
    const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.autoClear = false;
    this.renderer = renderer;
    const size = () => renderer.setSize(innerWidth, innerHeight, false);
    size();

    const crtGroup = new T.Group();
    const crtState = this._loadComputer(T, crtGroup);
    const rubik = this._makeRubik(T);
    const objs = [
      { id: 'slot-crt', dist: 5.0, spin: 0, tilt: 0.22, scrollRot: true, baseRot: { x: -0.05, y: 0, z: 0 }, o: this._mkScene(T, crtGroup), up: (dt, now) => crtState.update(dt, now) },
      { id: 'slot-rubik', dist: 8.4, spin: 0.26, tilt: 0.4, baseRot: { x: -0.16, y: 0.35, z: 0 }, o: this._mkScene(T, rubik.group), up: rubik.update },
    ];
    addEventListener('resize', size);

    const clock = new T.Clock();
    const frame = () => {
      this._glRaf = requestAnimationFrame(frame);
      const H = innerHeight;
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      const now = clock.getElapsedTime();
      const dt = Math.min(0.05, now - (this._lt || now)); this._lt = now;
      const pad = 16;
      for (const o of objs) {
        const el = $(o.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const vw = r.width - pad * 2, top = r.top + pad, h = r.height - pad * 2;
        if (vw <= 0 || h <= 0 || top + h < 40 || top > H - 40) continue;
        const vx = r.left + pad, vy = H - (top + h);
        renderer.setViewport(vx, vy, vw, h);
        renderer.setScissor(vx, vy, vw, h);
        const cam = o.o.cam; cam.aspect = vw / h; cam.position.set(0, 0, o.dist); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
        const grp = o.o.grp, b = o.baseRot;
        if (this.reduced) {
          grp.rotation.set(b.x + 0.14, b.y, b.z);
          if (o.up) o.up(dt, now);
        } else if (o.scrollRot) {
          const prog = Math.max(0, Math.min(1, 1 - (r.top + r.height / 2) / H));
          const targetY = b.y + (prog - 0.5) * 1.9;
          o._sy = o._sy == null ? targetY : o._sy + (targetY - o._sy) * 0.08;
          grp.rotation.y = o._sy;
          grp.rotation.x = b.x + Math.sin(now * 0.6) * 0.03 + (this.mouse.y - 0.5) * o.tilt * 0.5;
          grp.rotation.z = b.z + (this.mouse.x - 0.5) * 0.05;
          grp.position.y = Math.sin(now * 0.9) * 0.07;
          if (o.up) o.up(dt, now);
        } else {
          o._spin = (o._spin || 0) + o.spin * dt;
          grp.rotation.y = b.y + o._spin;
          grp.rotation.x = b.x + Math.sin(now * 0.7 + o.dist) * 0.05 + (this.mouse.y - 0.5) * o.tilt;
          grp.rotation.z = b.z + (this.mouse.x - 0.5) * 0.08;
          grp.position.y = Math.sin(now * 0.9 + o.dist) * 0.12;
          if (o.up) o.up(dt, now);
        }
        renderer.render(o.o.scene, o.o.cam);
      }
    };
    frame();
  }
}

/* ---------- Constellation background ---------- */

function initConstellation() {
  const cv = $('constellation');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(max-width: 720px)').matches;
  let W, H, pts, DPR = Math.min(devicePixelRatio || 1, 2);
  const COUNT = mobile ? 48 : 130;
  const LINK = mobile ? 135 : 185;
  const mouse = { x: 0.5, y: 0.5 };
  addEventListener('mousemove', (e) => { mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight; }, { passive: true });
  const resize = () => { W = cv.width = innerWidth * DPR; H = cv.height = innerHeight * DPR; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; };
  resize();
  pts = Array.from({ length: COUNT }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.18 * DPR, vy: (Math.random() - 0.5) * 0.18 * DPR, r: (Math.random() * 1.9 + 1.0) * DPR }));
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });

  const drawConst = (m) => {
    ctx.clearRect(0, 0, W, H);
    const maxD = LINK * DPR;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.hypot(dx, dy);
      if (d < maxD) { const a = (1 - d / maxD) * 0.34; ctx.strokeStyle = 'rgba(37,99,235,' + a.toFixed(3) + ')'; ctx.lineWidth = (0.5 + (1 - d / maxD) * 0.8) * DPR; ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke(); }
    }
    if (m) { const cR = 220 * DPR; for (const p of pts) { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < cR) { const a = (1 - d / cR) * 0.55; ctx.strokeStyle = 'rgba(37,99,235,' + a.toFixed(3) + ')'; ctx.lineWidth = 1.1 * DPR; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(p.x, p.y); ctx.stroke(); } } }
    ctx.shadowColor = 'rgba(37,99,235,.55)';
    for (const p of pts) { let bright = 0; if (m) { const d = Math.hypot(p.x - m.x, p.y - m.y); bright = Math.max(0, 1 - d / (200 * DPR)); } ctx.shadowBlur = bright * 12 * DPR; ctx.fillStyle = 'rgba(37,99,235,' + (0.42 + bright * 0.5).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + bright * 0.6), 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0;
  };

  if (reduced) { drawConst(null); return; }
  const loop = () => {
    requestAnimationFrame(loop);
    const mx = mouse.x * W, my = mouse.y * H;
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy, R = 110 * DPR;
      if (d2 < R * R && d2 > 1) { const f = (1 - Math.sqrt(d2) / R) * 0.6; p.x += dx / Math.sqrt(d2) * f; p.y += dy / Math.sqrt(d2) * f; }
    }
    drawConst({ x: mx, y: my });
  };
  loop();
}

/* ---------- Boot ---------- */

async function init() {
  initNav();
  initFades();
  initProjectHover();
  initForm();
  initConstellation();
  if (!matchMedia('(max-width: 720px)').matches && window.THREE) {
    new Retro3D().init();
  }

  try {
    const res = await fetch('/api/site');
    if (res.ok) renderSite(await res.json());
  } catch (_) { /* keep static design content */ }

  loadNow(); loadTop();
  setInterval(loadNow, 30000);
}

document.addEventListener('DOMContentLoaded', init);

// exposed for debugging / manual mounts
window.Retro3D = Retro3D;
