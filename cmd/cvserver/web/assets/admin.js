'use strict';

const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
  return data;
}

let SITE = null;

// ---------- background (shared look with the public site) ----------

function initMobileMenu() {
  const btn = $('menu-toggle');
  const tabs = $('admin-tabs');
  if (!btn || !tabs) return;
  btn.addEventListener('click', () => {
    tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function initNavGlass() {
  const nav = $('nav');
  if (!nav) return;
  const onScroll = () => {
    const on = window.scrollY > 20;
    nav.style.background = on ? 'var(--navbg)' : 'transparent';
    nav.style.backdropFilter = on ? 'blur(26px) saturate(160%)' : 'none';
    nav.style.webkitBackdropFilter = on ? 'blur(26px) saturate(160%)' : 'none';
    nav.style.boxShadow = on ? '0 1px 0 rgba(255,255,255,.06)' : 'none';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function initStarfield() {
  const cv = $('bg-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let W, H;
  const resize = () => { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);
  const STARS = Array.from({ length: 60 }, () => ({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.3, a: Math.random() * 0.5 + 0.1,
    vx: (Math.random() - 0.5) * 0.00012, vy: (Math.random() - 0.5) * 0.00012,
  }));
  const draw = () => {
    requestAnimationFrame(draw);
    const AC = '37,99,235';
    ctx.clearRect(0, 0, W, H);
    STARS.forEach((s) => {
      s.x = ((s.x + s.vx) + 1) % 1;
      s.y = ((s.y + s.vy) + 1) % 1;
      ctx.fillStyle = `rgba(${AC},${(s.a * 0.4).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill();
    });
  };
  draw();
}

// ---------- auth ----------
async function checkAuth() {
  try { await api('GET', '/api/admin/me'); showPanel(); }
  catch (_) { showLogin(); }
}
function showLogin() { $('login').classList.remove('hidden'); $('panel').classList.add('hidden'); }
function showPanel() {
  $('login').classList.add('hidden'); $('panel').classList.remove('hidden'); loadAll();
  const params = new URLSearchParams(location.search);
  const spotifyResult = params.get('spotify');
  if (spotifyResult) {
    switchTab('spotify');
    history.replaceState({}, '', location.pathname);
  }
}

$('login-btn').addEventListener('click', doLogin);
$('login-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  const st = $('login-status'); st.textContent = '…'; st.className = 'admin-status';
  try {
    await api('POST', '/api/admin/login', { password: $('login-pass').value });
    showPanel();
  } catch (err) { st.textContent = err.message; st.className = 'admin-status err'; }
}
$('logout-btn').addEventListener('click', async () => { await api('POST', '/api/admin/logout'); showLogin(); });

// ---------- tabs ----------
document.querySelectorAll('.admin-tab').forEach((b) => {
  b.addEventListener('click', () => switchTab(b.dataset.tab));
});
function switchTab(tab) {
  document.querySelectorAll('.admin-tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.add('hidden'));
  $('tab-' + tab).classList.remove('hidden');
  if (tab === 'messages') loadMessages();
  if (tab === 'movies') loadMovies();
  if (tab === 'spotify') loadSpotifyStatus();
}

async function loadAll() {
  SITE = await api('GET', '/api/site');
  renderProfile();
  renderProjects();
  renderSkills();
  renderEducation();
  renderInterests();
  renderRubik();
}

function statusSpan(id) { return `<span id="${id}" class="admin-status"></span>`; }
function setStatus(id, msg, ok) { const e = $(id); if (e) { e.textContent = msg; e.className = 'admin-status ' + (ok ? 'ok' : 'err'); } }

// ---------- profile ----------
function renderProfile() {
  const p = SITE.profile;
  $('tab-profile').innerHTML = `
    <div class="gc admin-card">
      <h2>// Профиль</h2>
      <div class="row">
        <div><label>Имя</label><input id="p-first" value="${esc(p.first_name)}"></div>
        <div><label>Фамилия</label><input id="p-last" value="${esc(p.last_name)}"></div>
      </div>
      <label>Роль (например: Разработчик · Developer)</label><input id="p-role" value="${esc(p.role)}">
      <label>Локация</label><input id="p-loc" value="${esc(p.location)}">
      <label>Подзаголовок / tagline</label><input id="p-tag" value="${esc(p.tagline)}">
      <label>Возраст</label><input id="p-age" value="${esc(p.age)}" placeholder="например: 19 лет">
      <label>О себе (RU)</label><textarea id="p-aboutru" rows="6">${esc(p.about_ru)}</textarea>
      <label>О себе (EN)</label><textarea id="p-abouten" rows="4">${esc(p.about_en)}</textarea>
      <div class="row">
        <div><label>Email</label><input id="p-email" value="${esc(p.email)}"></div>
        <div><label>Телефон</label><input id="p-phone" value="${esc(p.phone)}"></div>
      </div>
      <div class="row">
        <div><label>Telegram (без @)</label><input id="p-tg" value="${esc(p.telegram)}"></div>
        <div><label>GitHub (логин)</label><input id="p-gh" value="${esc(p.github)}"></div>
      </div>
      <div class="row">
        <div><label>Фото — загрузить</label><input id="p-photo-file" type="file" accept="image/*"></div>
        <div><label>Резюме PDF — загрузить</label><input id="p-resume-file" type="file" accept="application/pdf"></div>
      </div>
      <div class="muted">Текущее фото: <code>${esc(p.photo || '—')}</code> · резюме: <code>${esc(p.resume || '—')}</code></div>
      <div class="admin-toolbar-row"><button id="p-save" class="btn-primary neon-btn">Сохранить профиль</button>${statusSpan('p-status')}</div>
    </div>`;
  $('p-save').addEventListener('click', saveProfile);
  $('p-photo-file').addEventListener('change', (e) => uploadFile(e.target, 'photo', 'photo'));
  $('p-resume-file').addEventListener('change', (e) => uploadFile(e.target, 'resume', 'resume'));
}

async function uploadFile(input, kind, field) {
  if (!input.files || !input.files[0]) return;
  const fd = new FormData(); fd.set('kind', kind); fd.set('file', input.files[0]);
  setStatus('p-status', 'Загрузка…', true);
  try {
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ошибка загрузки');
    SITE.profile[field] = data.url;
    setStatus('p-status', (kind === 'photo' ? 'Фото' : 'Резюме') + ' загружено: ' + data.url + ' — нажмите «Сохранить»', true);
  } catch (err) { setStatus('p-status', err.message, false); }
}

async function saveProfile() {
  const p = SITE.profile;
  const body = {
    first_name: $('p-first').value, last_name: $('p-last').value, role: $('p-role').value,
    location: $('p-loc').value, tagline: $('p-tag').value, age: $('p-age').value,
    about_ru: $('p-aboutru').value, about_en: $('p-abouten').value,
    email: $('p-email').value, phone: $('p-phone').value,
    telegram: $('p-tg').value, github: $('p-gh').value,
    photo: p.photo, resume: p.resume,
    rubik_label: p.rubik_label, rubik_title: p.rubik_title, rubik_text: p.rubik_text,
  };
  try { await api('PUT', '/api/admin/profile', body); SITE.profile = Object.assign(p, body); setStatus('p-status', 'Сохранено ✓', true); }
  catch (err) { setStatus('p-status', err.message, false); }
}

// ---------- projects ----------
function renderProjects() {
  const items = (SITE.projects || []).map((pr) => projectForm(pr)).join('');
  $('tab-projects').innerHTML = `<div class="gc admin-card"><h2>// Проекты</h2>${items}
    <button class="btn-small" id="proj-add">+ Добавить проект</button></div>`;
  SITE.projects.forEach((pr) => bindProject(pr.id));
  $('proj-add').addEventListener('click', () => {
    SITE.projects.push({ id: 0, title: '', stack: '', description: '', metrics: '', url: '', pos: SITE.projects.length });
    renderProjects();
  });
}
function projectForm(pr) {
  const k = pr.id || 'new';
  return `<div class="admin-item" data-k="${k}">
    <label>Название</label><input id="pj-title-${k}" value="${esc(pr.title)}">
    <label>Стек</label><input id="pj-stack-${k}" value="${esc(pr.stack)}">
    <label>Метрики (необязательно)</label><input id="pj-metrics-${k}" value="${esc(pr.metrics)}">
    <label>Описание</label><textarea id="pj-desc-${k}" rows="4">${esc(pr.description)}</textarea>
    <label>Ссылка (URL)</label><input id="pj-url-${k}" value="${esc(pr.url)}">
    <div class="admin-toolbar-row">
      <button class="btn-small" data-save="${k}" data-id="${pr.id}">Сохранить</button>
      ${pr.id ? `<button class="btn-danger" data-del="${pr.id}">Удалить</button>` : ''}
      ${statusSpan('pj-status-' + k)}
    </div></div>`;
}
function bindProject(id) {
  const k = id || 'new';
  const card = document.querySelector(`#tab-projects .admin-item[data-k="${k}"]`);
  if (!card) return;
  card.querySelector(`[data-save="${k}"]`).addEventListener('click', async (e) => {
    const body = {
      id: Number(e.target.dataset.id) || 0,
      title: $('pj-title-' + k).value, stack: $('pj-stack-' + k).value,
      metrics: $('pj-metrics-' + k).value, description: $('pj-desc-' + k).value,
      url: $('pj-url-' + k).value, pos: 0,
    };
    try { await api('POST', '/api/admin/projects', body); await loadAll(); }
    catch (err) { setStatus('pj-status-' + k, err.message, false); }
  });
  const del = card.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Удалить проект?')) return;
    await api('DELETE', '/api/admin/projects/' + del.dataset.del); await loadAll();
  });
}

// ---------- skills ----------
// level: main (основной) | strong (уверенно) | work (рабочий)
const SKILL_LEVELS = [
  { v: 'main', t: 'основной' },
  { v: 'strong', t: 'уверенно' },
  { v: 'work', t: 'рабочий' },
];
function skillLevelOf(s) {
  // legacy rows have no level — derive from highlight so the dropdown isn't empty
  if (s.level) return s.level;
  return s.highlight ? 'strong' : 'work';
}
function levelOptions(sel) {
  return SKILL_LEVELS.map((l) =>
    `<option value="${l.v}"${l.v === sel ? ' selected' : ''}>${l.t}</option>`).join('');
}
function renderSkills() {
  const groups = (SITE.skills || []).map((g) => `
    <div class="admin-item">
      <div class="admin-item__head"><strong>${esc(g.title)}</strong>
        <button class="btn-danger" data-delgroup="${g.id}">Удалить группу</button></div>
      <div class="admin-skill-rows">${(g.skills || []).map((s) => `
        <div class="admin-toolbar-row" data-skillrow="${s.id}">
          <input id="sk-name-${s.id}" value="${esc(s.name)}" style="max-width:200px">
          <select id="sk-lvl-${s.id}">${levelOptions(skillLevelOf(s))}</select>
          <button class="btn-small" data-savesk="${s.id}" data-gid="${g.id}">Сохранить</button>
          <button class="btn-danger" data-delskill="${s.id}">✕</button>
          ${statusSpan('sk-status-' + s.id)}
        </div>`).join('')}</div>
      <div class="admin-toolbar-row">
        <input id="sk-new-${g.id}" placeholder="Новый навык" style="max-width:200px">
        <select id="sk-newlvl-${g.id}">${levelOptions('work')}</select>
        <button class="btn-small" data-addskill="${g.id}">+ Навык</button>
      </div>
    </div>`).join('');
  $('tab-skills').innerHTML = `<div class="gc admin-card"><h2>// Навыки</h2>${groups}
    <div class="admin-toolbar-row">
      <input id="sk-newgroup" placeholder="Название новой группы" style="max-width:240px">
      <button class="btn-small" id="sk-addgroup">+ Группа</button>
    </div></div>`;

  document.querySelectorAll('[data-addskill]').forEach((b) => b.addEventListener('click', async () => {
    const gid = Number(b.dataset.addskill);
    const name = $('sk-new-' + gid).value.trim(); if (!name) return;
    const level = $('sk-newlvl-' + gid).value;
    await api('POST', '/api/admin/skills', { group_id: gid, name, level, highlight: level !== 'work', pos: 0 });
    await loadAll();
  }));
  document.querySelectorAll('[data-savesk]').forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.dataset.savesk);
    const level = $('sk-lvl-' + id).value;
    const body = { id, group_id: Number(b.dataset.gid), name: $('sk-name-' + id).value, level, highlight: level !== 'work', pos: 0 };
    try { await api('POST', '/api/admin/skills', body); setStatus('sk-status-' + id, 'Сохранено ✓', true); SITE = await api('GET', '/api/site'); }
    catch (err) { setStatus('sk-status-' + id, err.message, false); }
  }));
  document.querySelectorAll('[data-delskill]').forEach((b) => b.addEventListener('click', async () => {
    await api('DELETE', '/api/admin/skills/' + b.dataset.delskill); await loadAll();
  }));
  document.querySelectorAll('[data-delgroup]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Удалить всю группу и её навыки?')) return;
    await api('DELETE', '/api/admin/skill-groups/' + b.dataset.delgroup); await loadAll();
  }));
  $('sk-addgroup').addEventListener('click', async () => {
    const title = $('sk-newgroup').value.trim(); if (!title) return;
    await api('POST', '/api/admin/skill-groups', { id: 0, title, pos: SITE.skills.length });
    await loadAll();
  });
}

// ---------- education ----------
function renderEducation() {
  const items = (SITE.education || []).map((e) => eduForm(e)).join('');
  $('tab-education').innerHTML = `<div class="gc admin-card"><h2>// Образование</h2>${items}
    <button class="btn-small" id="edu-add">+ Добавить</button></div>`;
  SITE.education.forEach((e) => bindEdu(e.id));
  $('edu-add').addEventListener('click', () => {
    SITE.education.push({ id: 0, period: '', institution: '', major: '', description: '', pos: SITE.education.length });
    renderEducation();
  });
}
function eduForm(e) {
  const k = e.id || 'new';
  return `<div class="admin-item" data-k="${k}">
    <label>Период</label><input id="ed-period-${k}" value="${esc(e.period)}">
    <label>Учебное заведение</label><input id="ed-inst-${k}" value="${esc(e.institution)}">
    <label>Специальность / группа</label><input id="ed-major-${k}" value="${esc(e.major)}">
    <label>Описание</label><textarea id="ed-desc-${k}" rows="3">${esc(e.description)}</textarea>
    <div class="admin-toolbar-row"><button class="btn-small" data-save="${k}" data-id="${e.id}">Сохранить</button>
      ${e.id ? `<button class="btn-danger" data-del="${e.id}">Удалить</button>` : ''}${statusSpan('ed-status-' + k)}</div></div>`;
}
function bindEdu(id) {
  const k = id || 'new';
  const card = document.querySelector(`#tab-education .admin-item[data-k="${k}"]`);
  if (!card) return;
  card.querySelector(`[data-save="${k}"]`).addEventListener('click', async (e) => {
    const body = { id: Number(e.target.dataset.id) || 0, period: $('ed-period-' + k).value,
      institution: $('ed-inst-' + k).value, major: $('ed-major-' + k).value, description: $('ed-desc-' + k).value, pos: 0 };
    try { await api('POST', '/api/admin/education', body); await loadAll(); }
    catch (err) { setStatus('ed-status-' + k, err.message, false); }
  });
  const del = card.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => { if (confirm('Удалить?')) { await api('DELETE', '/api/admin/education/' + del.dataset.del); await loadAll(); } });
}

// ---------- interests ----------
function renderInterests() {
  const items = (SITE.interests || []).map((it) => intForm(it)).join('');
  $('tab-interests').innerHTML = `<div class="gc admin-card"><h2>// Увлечения</h2>${items}
    <button class="btn-small" id="int-add">+ Добавить</button></div>`;
  SITE.interests.forEach((it) => bindInt(it.id));
  $('int-add').addEventListener('click', () => {
    SITE.interests.push({ id: 0, symbol: '', title: '', subtitle: '', description: '', pos: SITE.interests.length });
    renderInterests();
  });
}
function intForm(it) {
  const k = it.id || 'new';
  return `<div class="admin-item" data-k="${k}">
    <div class="row">
      <div style="max-width:90px;flex:0 0 90px"><label>Символ</label><input id="in-sym-${k}" value="${esc(it.symbol)}"></div>
      <div><label>Заголовок</label><input id="in-title-${k}" value="${esc(it.title)}"></div>
      <div><label>Подзаголовок</label><input id="in-sub-${k}" value="${esc(it.subtitle)}"></div>
    </div>
    <label>Описание</label><textarea id="in-desc-${k}" rows="2">${esc(it.description)}</textarea>
    <div class="admin-toolbar-row"><button class="btn-small" data-save="${k}" data-id="${it.id}">Сохранить</button>
      ${it.id ? `<button class="btn-danger" data-del="${it.id}">Удалить</button>` : ''}${statusSpan('in-status-' + k)}</div></div>`;
}
function bindInt(id) {
  const k = id || 'new';
  const card = document.querySelector(`#tab-interests .admin-item[data-k="${k}"]`);
  if (!card) return;
  card.querySelector(`[data-save="${k}"]`).addEventListener('click', async (e) => {
    const body = { id: Number(e.target.dataset.id) || 0, symbol: $('in-sym-' + k).value,
      title: $('in-title-' + k).value, subtitle: $('in-sub-' + k).value, description: $('in-desc-' + k).value, pos: 0 };
    try { await api('POST', '/api/admin/interests', body); await loadAll(); }
    catch (err) { setStatus('in-status-' + k, err.message, false); }
  });
  const del = card.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => { if (confirm('Удалить?')) { await api('DELETE', '/api/admin/interests/' + del.dataset.del); await loadAll(); } });
}

// ---------- rubik block (interests section copy) ----------
// Stored on the profile row; saved through the same profile endpoint.
function renderRubik() {
  const p = SITE.profile;
  $('tab-rubik').innerHTML = `
    <div class="gc admin-card">
      <h2>// Блок кубика</h2>
      <div class="muted">Текст рядом с кубиком Рубика в разделе «Увлечения».</div>
      <label>Метка (моно, над кубиком)</label><input id="rb-label" value="${esc(p.rubik_label)}" placeholder="// 3×3 · self-solving">
      <label>Заголовок</label><input id="rb-title" value="${esc(p.rubik_title)}" placeholder="Разбираю сложное — и собираю обратно">
      <label>Текст</label><textarea id="rb-text" rows="4">${esc(p.rubik_text)}</textarea>
      <div class="admin-toolbar-row"><button id="rb-save" class="btn-primary neon-btn">Сохранить</button>${statusSpan('rb-status')}</div>
    </div>`;
  $('rb-save').addEventListener('click', saveRubik);
}
async function saveRubik() {
  const p = SITE.profile;
  // profile endpoint replaces the whole row, so send every field, overriding rubik ones
  const body = {
    first_name: p.first_name, last_name: p.last_name, role: p.role,
    location: p.location, tagline: p.tagline, age: p.age,
    about_ru: p.about_ru, about_en: p.about_en,
    email: p.email, phone: p.phone, telegram: p.telegram, github: p.github,
    photo: p.photo, resume: p.resume,
    rubik_label: $('rb-label').value, rubik_title: $('rb-title').value, rubik_text: $('rb-text').value,
  };
  try {
    await api('PUT', '/api/admin/profile', body);
    SITE.profile = Object.assign(p, body);
    setStatus('rb-status', 'Сохранено ✓', true);
  } catch (err) { setStatus('rb-status', err.message, false); }
}

// ---------- movies ----------
let MOVIES = [];
const MOVIE_KINDS = [{ v: 'movie', t: 'Фильм' }, { v: 'series', t: 'Сериал' }];
const MOVIE_STATUSES = [{ v: 'watched', t: 'Посмотрено' }, { v: 'dropped', t: 'Брошено' }, { v: 'planned', t: 'В планах' }];
const SOURCE_NAMES = { kp: 'Кинопоиск', tmdb: 'TMDB' };
// fields the lookup can fill; the admin picks which of them to overwrite
const LOOKUP_FIELDS = [
  ['title', 'Название'], ['original_title', 'Ориг. название'], ['kind', 'Тип'], ['year', 'Год'],
  ['director', 'Режиссёр'], ['genres', 'Жанры'], ['countries', 'Страны'], ['runtime', 'Длительность'],
  ['description', 'Описание'], ['poster', 'Постер'],
];
// external ids/ratings describe the matched film itself, so they're always applied
const LOOKUP_IDS = ['kp_id', 'imdb_id', 'tmdb_id', 'kp_rating', 'imdb_rating'];
const NUM_FIELDS = ['rating', 'runtime', 'kp_id', 'tmdb_id', 'kp_rating', 'imdb_rating'];
const EMPTY_MOVIE = {
  id: 0, title: '', kind: 'movie', year: '', rating: 0, review: '', poster: '', genres: '', status: 'watched',
  director: '', watched_at: '', favorite: false, pos: 0, original_title: '', description: '', countries: '',
  runtime: 0, kp_id: 0, imdb_id: '', tmdb_id: 0, kp_rating: 0, imdb_rating: 0,
};

let SOURCES = null; // { kp: bool, tmdb: bool } from the server
let SOURCE = '';
const LOOKUP = {}; // per card: { cands, details }
const BULK = { open: false, text: '', status: 'watched', rows: [], busy: false };

function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } }

async function loadMovies() {
  if (!SOURCES) {
    try { SOURCES = await api('GET', '/api/admin/lookup/sources'); } catch (_) { SOURCES = {}; }
    const saved = lsGet('mv-source');
    SOURCE = SOURCES[saved] ? saved : (SOURCES.kp ? 'kp' : (SOURCES.tmdb ? 'tmdb' : ''));
  }
  try { MOVIES = await api('GET', '/api/movies'); } catch (_) { MOVIES = []; }
  if (!Array.isArray(MOVIES)) MOVIES = [];
  renderMovies();
}
function movieOpts(list, sel) {
  return list.map((o) => `<option value="${o.v}"${o.v === sel ? ' selected' : ''}>${o.t}</option>`).join('');
}
function openMovieKeys() {
  return new Set([...document.querySelectorAll('#tab-movies details.mv-item[open]')].map((d) => d.dataset.k));
}
function renderMovies(keepOpen) {
  const open = keepOpen || openMovieKeys();
  const srcOpts = Object.keys(SOURCE_NAMES).filter((s) => SOURCES[s])
    .map((s) => `<option value="${s}"${s === SOURCE ? ' selected' : ''}>${SOURCE_NAMES[s]}</option>`).join('');
  const lookupBar = SOURCE
    ? `<label class="mv-inline">Искать на <select id="mv-source">${srcOpts}</select></label>
       <button class="btn-small" id="mv-bulk-toggle">${BULK.open ? 'Скрыть импорт' : 'Массовый импорт'}</button>`
    : `<span class="muted">Автозаполнение выключено: добавьте <code>KINOPOISK_API_KEY</code> и/или <code>TMDB_API_KEY</code> в .env</span>`;
  $('tab-movies').innerHTML = `<div class="gc admin-card"><h2>// Кино (${MOVIES.length})</h2>
    <div class="muted">Фильмы и сериалы для страницы <a href="/films" target="_blank">/films</a>.</div>
    <div class="admin-toolbar-row mv-toolbar">
      <button class="btn-small" id="mv-add">+ Добавить фильм / сериал</button>
      ${lookupBar}
    </div>
    <div id="mv-bulk" class="admin-item${BULK.open && SOURCE ? '' : ' hidden'}"></div>
    ${MOVIES.map((m) => movieForm(m, open.has(String(m.id || 'new')))).join('')}</div>`;
  MOVIES.forEach((m) => bindMovie(m.id));
  $('mv-add').addEventListener('click', () => {
    if (MOVIES.some((m) => !m.id)) return;
    MOVIES.unshift(Object.assign({}, EMPTY_MOVIE));
    renderMovies(new Set([...openMovieKeys(), 'new']));
    const t = $('mv-title-new'); if (t) t.focus();
  });
  if (SOURCE) {
    $('mv-source').addEventListener('change', (e) => { SOURCE = e.target.value; lsSet('mv-source', SOURCE); });
    $('mv-bulk-toggle').addEventListener('click', () => {
      BULK.open = !BULK.open;
      $('mv-bulk').classList.toggle('hidden', !BULK.open);
      $('mv-bulk-toggle').textContent = BULK.open ? 'Скрыть импорт' : 'Массовый импорт';
    });
    renderBulk();
  }
}

function fld(name, k) { return $('mv-' + name + '-' + k); }
function inp(name, k, label, val, attrs) {
  return `<div ${attrs || ''}><label>${label}</label><input id="mv-${name}-${k}" value="${esc(val)}"></div>`;
}
function posterPreview(url) {
  return url ? `<img src="${esc(url)}" alt="" onerror="this.style.visibility='hidden'">` : '<span>🎬</span>';
}

function movieForm(m, isOpen) {
  const k = m.id || 'new';
  const kind = MOVIE_KINDS.find((x) => x.v === m.kind);
  const summary = [m.year, kind ? kind.t : '', m.rating ? '★ ' + m.rating : ''].filter(Boolean).join(' · ');
  return `<details class="admin-item mv-item" data-k="${k}"${isOpen || !m.id ? ' open' : ''}>
    <summary class="mv-summary">
      <span class="mv-thumb">${posterPreview(m.poster)}</span>
      <span class="mv-summary__text"><strong>${esc(m.title || 'Новая запись')}</strong><span class="muted">${esc(summary)}</span></span>
      ${m.favorite ? '<span>⭐</span>' : ''}
    </summary>
    <div class="row">
      ${inp('title', k, 'Название', m.title, 'style="flex:3"')}
      ${inp('year', k, 'Год', m.year, 'style="max-width:100px"')}
      ${SOURCE ? `<div class="mv-find"><button class="btn-small" data-find="${k}">🔍 Найти данные</button></div>` : ''}
    </div>
    <div id="mv-lookup-${k}" class="mv-lookup hidden"></div>
    <div class="row">
      <div style="max-width:140px"><label>Тип</label><select id="mv-kind-${k}">${movieOpts(MOVIE_KINDS, m.kind)}</select></div>
      <div style="max-width:110px"><label>Оценка 0–10</label><input id="mv-rating-${k}" type="number" min="0" max="10" value="${m.rating || 0}"></div>
      <div style="max-width:170px"><label>Статус</label><select id="mv-status-${k}">${movieOpts(MOVIE_STATUSES, m.status)}</select></div>
      ${inp('watched_at', k, 'Дата просмотра', m.watched_at, 'style="max-width:170px"')}
      <div style="display:flex;align-items:flex-end"><label class="admin-toggle"><input type="checkbox" id="mv-favorite-${k}"${m.favorite ? ' checked' : ''}> ⭐ избранное</label></div>
    </div>
    <div class="row">
      ${inp('original_title', k, 'Оригинальное название', m.original_title)}
      ${inp('director', k, 'Режиссёр', m.director)}
    </div>
    <div class="row">
      ${inp('genres', k, 'Жанры (через запятую)', m.genres)}
      ${inp('countries', k, 'Страны', m.countries)}
      <div style="max-width:150px"><label>Длительность, мин</label><input id="mv-runtime-${k}" type="number" min="0" value="${m.runtime || 0}"></div>
    </div>
    <label>Описание</label><textarea id="mv-description-${k}" rows="3">${esc(m.description)}</textarea>
    <div class="mv-poster-row">
      <div class="mv-poster-preview" id="mv-poster-preview-${k}">${posterPreview(m.poster)}</div>
      <div style="flex:1;min-width:0">
        <label>Постер — URL</label><input id="mv-poster-${k}" value="${esc(m.poster)}" placeholder="https://… (скачается при сохранении) или загрузите файл">
        <label>Или загрузить постер</label><input id="mv-poster-file-${k}" type="file" accept="image/*">
      </div>
    </div>
    <div class="row mv-ids">
      ${inp('kp_id', k, 'Кинопоиск ID', m.kp_id || '')}
      ${inp('imdb_id', k, 'IMDb ID', m.imdb_id)}
      ${inp('tmdb_id', k, 'TMDB ID', m.tmdb_id || '')}
      ${inp('kp_rating', k, 'Рейтинг КП', m.kp_rating || '')}
      ${inp('imdb_rating', k, 'Рейтинг IMDb', m.imdb_rating || '')}
    </div>
    <label>Рецензия</label><textarea id="mv-review-${k}" rows="4">${esc(m.review)}</textarea>
    <div class="admin-toolbar-row">
      <button class="btn-small" data-save="${k}" data-id="${m.id}">Сохранить</button>
      ${m.id ? `<button class="btn-danger" data-del="${m.id}">Удалить</button>` : '<button class="btn-small" data-cancel="new">Отмена</button>'}
      ${statusSpan('mv-msg-' + k)}
    </div></details>`;
}

function readMovie(k, id) {
  const m = { id: Number(id) || 0, pos: 0, status: fld('status', k).value, kind: fld('kind', k).value,
    favorite: fld('favorite', k).checked };
  ['title', 'year', 'review', 'poster', 'genres', 'director', 'watched_at', 'original_title', 'description',
    'countries', 'imdb_id'].forEach((f) => { m[f] = fld(f, k).value.trim(); });
  NUM_FIELDS.forEach((f) => { m[f] = Number(String(fld(f, k).value).replace(',', '.')) || 0; });
  m.kp_id = Math.trunc(m.kp_id); m.tmdb_id = Math.trunc(m.tmdb_id); m.runtime = Math.trunc(m.runtime);
  return m;
}

function bindMovie(id) {
  const k = id || 'new';
  const card = document.querySelector(`#tab-movies .mv-item[data-k="${k}"]`);
  if (!card) return;
  const msg = 'mv-msg-' + k;
  fld('poster', k).addEventListener('change', (e) => { $('mv-poster-preview-' + k).innerHTML = posterPreview(e.target.value.trim()); });
  fld('poster-file', k).addEventListener('change', async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const fd = new FormData(); fd.set('kind', 'poster'); fd.set('file', e.target.files[0]);
    setStatus(msg, 'Загрузка постера…', true);
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ошибка загрузки');
      fld('poster', k).value = data.url;
      $('mv-poster-preview-' + k).innerHTML = posterPreview(data.url);
      setStatus(msg, 'Постер загружен — нажмите «Сохранить»', true);
    } catch (err) { setStatus(msg, err.message, false); }
  });
  const find = card.querySelector('[data-find]');
  if (find) find.addEventListener('click', () => lookupSearch(k));
  [fld('title', k), fld('year', k)].forEach((el) => el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && SOURCE) { e.preventDefault(); lookupSearch(k); }
  }));
  card.querySelector(`[data-save="${k}"]`).addEventListener('click', async (e) => {
    const body = readMovie(k, e.target.dataset.id);
    if (!body.title) { setStatus(msg, 'Укажите название', false); return; }
    e.target.disabled = true;
    setStatus(msg, posterIsRemote(body.poster) ? 'Сохраняю и скачиваю постер…' : 'Сохраняю…', true);
    try {
      const res = await api('POST', '/api/admin/movies', body);
      const open = openMovieKeys(); open.delete('new'); open.add(String(res.id));
      MOVIES = await api('GET', '/api/movies');
      renderMovies(open);
      setStatus('mv-msg-' + res.id, res.warning ? res.warning : 'Сохранено ✓', !res.warning);
    } catch (err) { e.target.disabled = false; setStatus(msg, err.message, false); }
  });
  const cancel = card.querySelector('[data-cancel]');
  if (cancel) cancel.addEventListener('click', () => { MOVIES = MOVIES.filter((m) => m.id); renderMovies(); });
  const del = card.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Удалить запись?')) return;
    await api('DELETE', '/api/admin/movies/' + del.dataset.del); await loadMovies();
  });
}
function posterIsRemote(u) { return /^https?:\/\//i.test(u || ''); }

// ---------- lookup: search → pick a match → choose fields to apply ----------

function lookupURL(path, params) { return '/api/admin/lookup/' + path + '?' + new URLSearchParams(params); }

// existingMatch finds a saved movie that is the same film as a lookup hit.
function existingMatch(c, exceptId) {
  return MOVIES.find((m) => m.id && m.id !== exceptId && (
    (c.source === 'kp' && m.kp_id === c.id) ||
    (c.source === 'tmdb' && m.tmdb_id === c.id && m.kind === c.kind)));
}
function candLabel(c) {
  const kind = c.kind === 'series' ? 'Сериал' : 'Фильм';
  return [c.year, kind, c.rating ? '★ ' + c.rating : ''].filter(Boolean).join(' · ');
}

async function lookupSearch(k) {
  const q = fld('title', k).value.trim();
  const box = $('mv-lookup-' + k);
  if (!q) { setStatus('mv-msg-' + k, 'Сначала введите название', false); return; }
  box.classList.remove('hidden');
  box.innerHTML = `<div class="muted">Ищу «${esc(q)}» на ${SOURCE_NAMES[SOURCE]}…</div>`;
  try {
    const cands = await api('GET', lookupURL('search', { source: SOURCE, q, year: fld('year', k).value.trim() }));
    LOOKUP[k] = { cands };
    renderCandidates(k);
  } catch (err) { box.innerHTML = `<div class="admin-status err">${esc(err.message)}</div>`; }
}

function renderCandidates(k) {
  const box = $('mv-lookup-' + k);
  const cands = LOOKUP[k].cands.slice(0, 8);
  const selfId = k === 'new' ? 0 : Number(k);
  box.innerHTML = `<div class="mv-lookup__head"><span>Выберите совпадение (${SOURCE_NAMES[SOURCE]})</span><button class="btn-icon" data-close>✕</button></div>
    ${cands.length ? `<div class="mv-cands">${cands.map((c, i) => {
      const dup = existingMatch(c, selfId);
      return `<button class="mv-cand" data-i="${i}">
        <span class="mv-thumb">${posterPreview(c.thumb)}</span>
        <span class="mv-cand__text"><strong>${esc(c.title)}</strong>
          ${c.original_title ? `<span class="muted">${esc(c.original_title)}</span>` : ''}
          <span class="muted">${esc(candLabel(c))}</span>
          ${dup ? `<span class="mv-dup">уже в списке</span>` : ''}</span></button>`;
    }).join('')}</div>` : '<div class="muted">Ничего не найдено. Попробуйте другое написание или другой источник.</div>'}`;
  box.querySelector('[data-close]').addEventListener('click', () => box.classList.add('hidden'));
  box.querySelectorAll('.mv-cand').forEach((b) => b.addEventListener('click', () => lookupDetails(k, cands[Number(b.dataset.i)])));
}

async function lookupDetails(k, c) {
  const box = $('mv-lookup-' + k);
  box.innerHTML = `<div class="muted">Загружаю «${esc(c.title)}»…</div>`;
  try {
    LOOKUP[k].details = await api('GET', lookupURL('details', { source: c.source, id: c.id, kind: c.kind }));
    renderApply(k);
  } catch (err) { box.innerHTML = `<div class="admin-status err">${esc(err.message)}</div>`; }
}

function showVal(f, v) {
  if (f === 'kind') return v === 'series' ? 'Сериал' : 'Фильм';
  if (f === 'runtime') return v ? v + ' мин' : '';
  if (f === 'poster') return v ? `<span class="mv-thumb">${posterPreview(v)}</span>` : '';
  const s = String(v == null ? '' : v);
  return esc(s.length > 140 ? s.slice(0, 140) + '…' : s);
}

function renderApply(k) {
  const d = LOOKUP[k].details;
  const isNew = k === 'new';
  const rows = LOOKUP_FIELDS.filter(([f]) => d[f]).map(([f, label]) => {
    const cur = fld(f, k).value.trim();
    const same = String(cur) === String(d[f]);
    const empty = !cur || cur === '0';
    const checked = !same && (empty || (isNew && f === 'kind'));
    return `<tr class="${same ? 'same' : ''}">
      <td><input type="checkbox" data-f="${f}"${checked ? ' checked' : ''}${same ? ' disabled' : ''}></td>
      <td class="mv-apply__label">${label}</td>
      <td class="mv-apply__cur">${empty ? '<span class="muted">—</span>' : showVal(f, cur)}</td>
      <td class="mv-apply__new">${showVal(f, d[f])}</td></tr>`;
  }).join('');
  const ids = [d.kp_id && 'КП ' + d.kp_id, d.imdb_id && 'IMDb ' + d.imdb_id, d.tmdb_id && 'TMDB ' + d.tmdb_id,
    d.kp_rating && '★КП ' + d.kp_rating, d.imdb_rating && '★IMDb ' + d.imdb_rating].filter(Boolean).join(' · ');
  const box = $('mv-lookup-' + k);
  box.innerHTML = `<div class="mv-lookup__head"><span>Что подставить: «${esc(d.title)}»${d.year ? ' (' + esc(d.year) + ')' : ''}</span><button class="btn-icon" data-close>✕</button></div>
    <table class="mv-apply"><thead><tr><th></th><th>Поле</th><th>Сейчас</th><th>Найдено</th></tr></thead><tbody>${rows}</tbody></table>
    ${ids ? `<div class="muted">Также будут записаны: ${esc(ids)}</div>` : ''}
    <div class="admin-toolbar-row">
      <button class="btn-small" data-pick="empty">Только пустые</button>
      <button class="btn-small" data-pick="all">Все поля</button>
      <button class="btn-primary mv-apply__go" data-apply>Подставить</button>
      <button class="btn-small" data-back>← К результатам</button>
    </div>`;
  box.querySelector('[data-close]').addEventListener('click', () => box.classList.add('hidden'));
  box.querySelector('[data-back]').addEventListener('click', () => renderCandidates(k));
  box.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    box.querySelectorAll('input[data-f]:not(:disabled)').forEach((cb) => {
      const cur = fld(cb.dataset.f, k).value.trim();
      cb.checked = b.dataset.pick === 'all' || !cur || cur === '0';
    });
  }));
  box.querySelector('[data-apply]').addEventListener('click', () => {
    box.querySelectorAll('input[data-f]:checked').forEach((cb) => { fld(cb.dataset.f, k).value = d[cb.dataset.f]; });
    LOOKUP_IDS.forEach((f) => { fld(f, k).value = d[f] || ''; });
    $('mv-poster-preview-' + k).innerHTML = posterPreview(fld('poster', k).value);
    box.classList.add('hidden');
    setStatus('mv-msg-' + k, 'Данные подставлены — проверьте и нажмите «Сохранить»', true);
  });
}

// ---------- bulk import: list of "title, year" lines → matches → save all ----------

// parseBulkLine accepts "Title, 2021", "Title (2021)", "Title; 2021", "Title | 2021", "Title — 2021"
// or just "Title". A bare trailing number without a separator stays part of the
// title, otherwise "Бегущий по лезвию 2049" would lose its "2049".
function parseBulkLine(line) {
  const m = line.match(/^(.*?)\s*(?:[,;|\t]|\s[-–—]\s|\()\s*((?:18|19|20)\d{2})\s*\)?\s*$/);
  if (m && m[1].trim()) return { title: m[1].trim(), year: m[2] };
  return { title: line.trim(), year: '' };
}

async function runPool(items, limit, fn) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function renderBulk() {
  const el = $('mv-bulk');
  if (!el) return;
  const selectable = BULK.rows.filter((r) => r.checked && r.cands && r.cands[r.sel]).length;
  el.innerHTML = `<label>Список — по одному на строку: «Название, год» или «Название (год)»</label>
    <textarea id="mv-bulk-text" rows="6" placeholder="Дюна, 2021&#10;Острые козырьки (2013)&#10;Сталкер">${esc(BULK.text)}</textarea>
    <div class="admin-toolbar-row">
      <label class="mv-inline">Статус для всех <select id="mv-bulk-status">${movieOpts(MOVIE_STATUSES, BULK.status)}</select></label>
      <button class="btn-small" id="mv-bulk-search"${BULK.busy ? ' disabled' : ''}>Найти совпадения</button>
      ${statusSpan('mv-bulk-msg')}
    </div>
    ${BULK.rows.length ? `<table class="mv-bulk"><thead><tr><th></th><th>Строка</th><th>Совпадение (${SOURCE_NAMES[SOURCE]})</th><th></th><th></th></tr></thead><tbody>
      ${BULK.rows.map((r, i) => bulkRow(r, i)).join('')}</tbody></table>
      <div class="admin-toolbar-row">
        <button class="btn-primary" id="mv-bulk-import"${BULK.busy || !selectable ? ' disabled' : ''}>Импортировать выбранные (${selectable})</button>
        <span class="muted">Выберите статус до импорта; оценки и рецензии допишете потом.</span>
      </div>` : ''}`;
  $('mv-bulk-text').addEventListener('input', (e) => { BULK.text = e.target.value; });
  $('mv-bulk-status').addEventListener('change', (e) => { BULK.status = e.target.value; });
  $('mv-bulk-search').addEventListener('click', bulkSearch);
  const imp = $('mv-bulk-import');
  if (imp) imp.addEventListener('click', bulkImport);
  el.querySelectorAll('[data-bulk-check]').forEach((cb) => cb.addEventListener('change', () => {
    BULK.rows[Number(cb.dataset.bulkCheck)].checked = cb.checked; renderBulk();
  }));
  el.querySelectorAll('[data-bulk-sel]').forEach((s) => s.addEventListener('change', () => {
    const r = BULK.rows[Number(s.dataset.bulkSel)];
    r.sel = Number(s.value);
    const c = r.cands[r.sel];
    r.dup = c ? !!existingMatch(c, 0) : false;
    r.checked = !!c && !r.dup;
    renderBulk();
  }));
}

function bulkRow(r, i) {
  const c = r.cands && r.cands[r.sel];
  let state = r.state;
  if (!state) state = r.cands ? (r.cands.length ? (r.dup ? '<span class="mv-dup">уже в списке</span>' : '') : '<span class="admin-status err">не найдено</span>') : '<span class="muted">…</span>';
  const opts = r.cands ? r.cands.slice(0, 8).map((x, j) =>
    `<option value="${j}"${j === r.sel ? ' selected' : ''}>${esc(x.title)} — ${esc(candLabel(x))}</option>`).join('') +
    `<option value="-1"${r.sel === -1 ? ' selected' : ''}>— пропустить —</option>` : '';
  return `<tr>
    <td><input type="checkbox" data-bulk-check="${i}"${r.checked ? ' checked' : ''}${!c || BULK.busy || r.done ? ' disabled' : ''}></td>
    <td>${esc(r.title)}${r.year ? ` <span class="muted">(${esc(r.year)})</span>` : ''}</td>
    <td>${r.cands && r.cands.length ? `<select data-bulk-sel="${i}"${BULK.busy || r.done ? ' disabled' : ''}>${opts}</select>` : ''}</td>
    <td><span class="mv-thumb">${c ? posterPreview(c.thumb) : ''}</span></td>
    <td>${state}</td></tr>`;
}

async function bulkSearch() {
  const lines = [...new Set(BULK.text.split('\n').map((l) => l.trim()).filter(Boolean))];
  if (!lines.length) { setStatus('mv-bulk-msg', 'Список пуст', false); return; }
  if (lines.length > 100) { setStatus('mv-bulk-msg', 'Не больше 100 строк за раз', false); return; }
  BULK.busy = true;
  BULK.rows = lines.map((l) => Object.assign(parseBulkLine(l), { cands: null, sel: 0, checked: false }));
  renderBulk();
  let failed = 0;
  await runPool(BULK.rows, 2, async (r) => {
    try {
      r.cands = await api('GET', lookupURL('search', { source: SOURCE, q: r.title, year: r.year }));
      const c = r.cands[0];
      r.dup = c ? !!existingMatch(c, 0) : false;
      r.checked = !!c && !r.dup;
      if (!c) r.sel = -1;
    } catch (err) {
      failed++; r.cands = []; r.sel = -1; r.state = `<span class="admin-status err">${esc(err.message)}</span>`;
    }
    renderBulk();
  });
  BULK.busy = false;
  renderBulk();
  const found = BULK.rows.filter((r) => r.cands && r.cands.length).length;
  setStatus('mv-bulk-msg', `Найдено ${found} из ${BULK.rows.length}${failed ? `, ошибок: ${failed}` : ''} — проверьте совпадения`, !failed);
}

async function bulkImport() {
  const todo = BULK.rows.filter((r) => r.checked && r.cands && r.cands[r.sel] && !r.done);
  if (!todo.length) return;
  BULK.busy = true;
  todo.forEach((r) => { r.state = '<span class="muted">в очереди…</span>'; });
  renderBulk();
  let ok = 0;
  await runPool(todo, 2, async (r) => {
    const c = r.cands[r.sel];
    r.state = '<span class="muted">импорт…</span>'; renderBulk();
    try {
      const d = await api('GET', lookupURL('details', { source: c.source, id: c.id, kind: c.kind }));
      // only fields the save endpoint knows: it rejects unknown json keys
      const body = Object.assign({}, EMPTY_MOVIE);
      LOOKUP_FIELDS.concat(LOOKUP_IDS.map((f) => [f])).forEach(([f]) => { if (d[f] != null) body[f] = d[f]; });
      body.status = BULK.status;
      const res = await api('POST', '/api/admin/movies', body);
      MOVIES.push(Object.assign(body, { id: res.id }));
      r.done = true; r.checked = false; ok++;
      r.state = res.warning ? `<span class="admin-status err">✓ без постера</span>` : '<span class="admin-status ok">✓</span>';
    } catch (err) { r.state = `<span class="admin-status err">${esc(err.message)}</span>`; }
    renderBulk();
  });
  BULK.busy = false;
  await loadMovies();
  setStatus('mv-bulk-msg', `Импортировано ${ok} из ${todo.length}`, ok === todo.length);
}

// ---------- messages ----------
async function loadMessages() {
  let msgs = [];
  try { msgs = await api('GET', '/api/admin/messages'); } catch (_) { /* keep empty */ }
  const html = msgs.length ? msgs.map((m) => `
    <div class="admin-item admin-msg ${m.is_read ? '' : 'unread'}">
      <div class="admin-item__head">
        <strong>${esc(m.name)}</strong>
        <span class="muted">${esc(new Date(m.created_at).toLocaleString('ru-RU'))}</span>
      </div>
      <div class="muted">${esc(m.email || '—')}</div>
      <p>${esc(m.body)}</p>
      <div class="admin-toolbar-row">
        ${m.is_read ? '' : `<button class="btn-small" data-read="${m.id}">Прочитано</button>`}
        <button class="btn-danger" data-delmsg="${m.id}">Удалить</button>
      </div>
    </div>`).join('') : '<div class="muted">Сообщений пока нет.</div>';
  $('tab-messages').innerHTML = `<div class="gc admin-card"><h2>// Сообщения</h2>${html}</div>`;
  document.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', async () => {
    await api('POST', '/api/admin/messages/' + b.dataset.read + '/read'); loadMessages();
  }));
  document.querySelectorAll('[data-delmsg]').forEach((b) => b.addEventListener('click', async () => {
    if (confirm('Удалить сообщение?')) { await api('DELETE', '/api/admin/messages/' + b.dataset.delmsg); loadMessages(); }
  }));
}

// ---------- spotify ----------
async function loadSpotifyStatus() {
  let status = null;
  try { status = await api('GET', '/api/admin/spotify/status'); } catch (_) { /* keep null */ }
  renderSpotify(status || { connected: false, enabled: false });
}

function renderSpotify(status) {
  const connectedBlock = status.connected
    ? `<div class="muted">Подключено ${status.connected_at ? 'с ' + esc(new Date(status.connected_at).toLocaleString('ru-RU')) : ''}</div>
       ${status.last_poll_at ? `<div class="muted">Последний опрос: ${esc(new Date(status.last_poll_at).toLocaleString('ru-RU'))}</div>` : ''}
       ${status.last_error ? `<div class="muted" style="color:#F87171">Ошибка: ${esc(status.last_error)}</div>` : ''}
       <div class="admin-toolbar-row"><button class="btn-danger" id="spotify-disconnect">Отключить</button></div>`
    : `<div class="muted">${status.enabled ? 'Аккаунт Spotify не подключён.' : 'Задайте SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REDIRECT_URI в конфиге сервера, затем подключите аккаунт.'}</div>
       <div class="admin-toolbar-row">
         ${status.enabled ? `<a href="/api/admin/spotify/connect"><button class="btn-primary neon-btn">Подключить Spotify</button></a>` : ''}
       </div>`;

  $('tab-spotify').innerHTML = `<div class="gc admin-card">
    <h2>// Spotify</h2>
    <div style="color:var(--t1)">Статус: <strong>${status.connected ? 'Подключено ✓' : 'Не подключено'}</strong></div>
    ${connectedBlock}
  </div>`;

  const disconnectBtn = $('spotify-disconnect');
  if (disconnectBtn) disconnectBtn.addEventListener('click', async () => {
    if (!confirm('Отключить Spotify?')) return;
    await api('POST', '/api/admin/spotify/disconnect');
    await loadSpotifyStatus();
  });
}

initMobileMenu();
checkAuth();
