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
// lives on the profile row, goes through the same profile endpoint
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

async function loadMovies() {
  try { MOVIES = await api('GET', '/api/movies'); } catch (_) { MOVIES = []; }
  if (!Array.isArray(MOVIES)) MOVIES = [];
  renderMovies();
}
function movieOpts(list, sel) {
  return list.map((o) => `<option value="${o.v}"${o.v === sel ? ' selected' : ''}>${o.t}</option>`).join('');
}
function renderMovies() {
  const items = MOVIES.map((m) => movieForm(m)).join('');
  $('tab-movies').innerHTML = `<div class="gc admin-card"><h2>// Кино (${MOVIES.length})</h2>
    <div class="muted">Фильмы и сериалы для страницы <a href="/films" target="_blank">/films</a>.</div>
    ${items}
    <button class="btn-small" id="mv-add">+ Добавить фильм / сериал</button></div>`;
  MOVIES.forEach((m) => bindMovie(m.id));
  $('mv-add').addEventListener('click', () => {
    MOVIES.unshift({ id: 0, title: '', kind: 'movie', year: '', rating: 0, review: '', poster: '', genres: '', status: 'watched', director: '', watched_at: '', favorite: false, pos: 0 });
    renderMovies();
  });
}
function movieForm(m) {
  const k = m.id || 'new';
  return `<div class="admin-item" data-k="${k}">
    <div class="row">
      <div style="flex:2"><label>Название</label><input id="mv-title-${k}" value="${esc(m.title)}"></div>
      <div style="max-width:140px"><label>Тип</label><select id="mv-kind-${k}">${movieOpts(MOVIE_KINDS, m.kind)}</select></div>
      <div style="max-width:100px"><label>Год</label><input id="mv-year-${k}" value="${esc(m.year)}" placeholder="2024"></div>
      <div style="max-width:110px"><label>Оценка 0–10</label><input id="mv-rating-${k}" type="number" min="0" max="10" value="${m.rating || 0}"></div>
    </div>
    <div class="row">
      <div><label>Режиссёр</label><input id="mv-director-${k}" value="${esc(m.director)}"></div>
      <div><label>Жанры (через запятую)</label><input id="mv-genres-${k}" value="${esc(m.genres)}" placeholder="драма, фантастика"></div>
    </div>
    <div class="row">
      <div style="max-width:170px"><label>Статус</label><select id="mv-status-${k}">${movieOpts(MOVIE_STATUSES, m.status)}</select></div>
      <div style="max-width:170px"><label>Дата просмотра</label><input id="mv-watched-${k}" value="${esc(m.watched_at)}" placeholder="напр. 2024 или 12.03.24"></div>
      <div style="display:flex;align-items:flex-end"><label class="admin-toggle"><input type="checkbox" id="mv-fav-${k}"${m.favorite ? ' checked' : ''}> ⭐ избранное</label></div>
    </div>
    <label>Постер — URL</label><input id="mv-poster-${k}" value="${esc(m.poster)}" placeholder="https://… или загрузите файл ниже">
    <div class="row">
      <div><label>Или загрузить постер</label><input id="mv-poster-file-${k}" type="file" accept="image/*"></div>
    </div>
    <label>Рецензия</label><textarea id="mv-review-${k}" rows="4">${esc(m.review)}</textarea>
    <div class="admin-toolbar-row">
      <button class="btn-small" data-save="${k}" data-id="${m.id}">Сохранить</button>
      ${m.id ? `<button class="btn-danger" data-del="${m.id}">Удалить</button>` : ''}
      ${statusSpan('mv-status-msg-' + k)}
    </div></div>`;
}
function bindMovie(id) {
  const k = id || 'new';
  const card = document.querySelector(`#tab-movies .admin-item[data-k="${k}"]`);
  if (!card) return;
  const posterFile = $('mv-poster-file-' + k);
  if (posterFile) posterFile.addEventListener('change', async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const fd = new FormData(); fd.set('kind', 'poster'); fd.set('file', e.target.files[0]);
    setStatus('mv-status-msg-' + k, 'Загрузка постера…', true);
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ошибка загрузки');
      $('mv-poster-' + k).value = data.url;
      setStatus('mv-status-msg-' + k, 'Постер загружен — нажмите «Сохранить»', true);
    } catch (err) { setStatus('mv-status-msg-' + k, err.message, false); }
  });
  card.querySelector(`[data-save="${k}"]`).addEventListener('click', async (e) => {
    const body = {
      id: Number(e.target.dataset.id) || 0,
      title: $('mv-title-' + k).value, kind: $('mv-kind-' + k).value,
      year: $('mv-year-' + k).value, rating: Number($('mv-rating-' + k).value) || 0,
      review: $('mv-review-' + k).value, poster: $('mv-poster-' + k).value,
      genres: $('mv-genres-' + k).value, status: $('mv-status-' + k).value,
      director: $('mv-director-' + k).value, watched_at: $('mv-watched-' + k).value,
      favorite: $('mv-fav-' + k).checked, pos: 0,
    };
    if (!body.title.trim()) { setStatus('mv-status-msg-' + k, 'Укажите название', false); return; }
    try { await api('POST', '/api/admin/movies', body); await loadMovies(); }
    catch (err) { setStatus('mv-status-msg-' + k, err.message, false); }
  });
  const del = card.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Удалить запись?')) return;
    await api('DELETE', '/api/admin/movies/' + del.dataset.del); await loadMovies();
  });
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
