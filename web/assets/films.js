'use strict';

/* Films page — fetches /api/movies, renders a filterable grid + detail modal.
   Same visual language as the main site. Filtering is client-side. */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function $(id) { return document.getElementById(id); }

const KIND_LABEL = { movie: 'Фильм', series: 'Сериал' };
const STATUS_LABEL = { watched: 'Посмотрено', dropped: 'Брошено', planned: 'В планах' };

let ALL = [];
const state = { q: '', kind: '', status: '', genre: '', sort: 'new' };

function splitGenres(s) {
  return String(s || '').split(',').map((g) => g.trim()).filter(Boolean);
}

async function load() {
  try {
    ALL = await (await fetch('/api/movies')).json();
  } catch (_) { ALL = []; }
  if (!Array.isArray(ALL)) ALL = [];
  buildChips();
  render();
}

function buildChips() {
  // kind
  const kinds = [...new Set(ALL.map((m) => m.kind).filter(Boolean))];
  $('kind-chips').innerHTML = chipHTML('kind', '', 'Все') +
    kinds.map((k) => chipHTML('kind', k, KIND_LABEL[k] || k)).join('');
  // status
  const statuses = [...new Set(ALL.map((m) => m.status).filter(Boolean))];
  $('status-chips').innerHTML = statuses.length
    ? chipHTML('status', '', 'Любой статус') + statuses.map((s) => chipHTML('status', s, STATUS_LABEL[s] || s)).join('')
    : '';
  // genres
  const genreSet = new Set();
  ALL.forEach((m) => splitGenres(m.genres).forEach((g) => genreSet.add(g)));
  const genres = [...genreSet].sort((a, b) => a.localeCompare(b, 'ru'));
  $('genre-chips').innerHTML = genres.length
    ? chipHTML('genre', '', 'Все жанры') + genres.map((g) => chipHTML('genre', g, g)).join('')
    : '';
  bindChips();
}

function chipHTML(group, value, label) {
  const on = state[group] === value;
  return `<span class="chip${on ? ' on' : ''}" data-group="${group}" data-value="${esc(value)}">${esc(label)}</span>`;
}

function bindChips() {
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    state[c.dataset.group] = c.dataset.value;
    // re-render chip active states within the same group without rebuilding the list of chips
    document.querySelectorAll(`.chip[data-group="${c.dataset.group}"]`).forEach((x) =>
      x.classList.toggle('on', x.dataset.value === c.dataset.value));
    render();
  }));
}

function matches(m) {
  if (state.kind && m.kind !== state.kind) return false;
  if (state.status && m.status !== state.status) return false;
  if (state.genre && !splitGenres(m.genres).includes(state.genre)) return false;
  if (state.q) {
    const hay = (m.title + ' ' + (m.director || '') + ' ' + (m.genres || '')).toLowerCase();
    if (!hay.includes(state.q.toLowerCase())) return false;
  }
  return true;
}

function sortList(list) {
  const s = state.sort;
  const arr = list.slice();
  if (s === 'rating') arr.sort((a, b) => b.rating - a.rating);
  else if (s === 'title') arr.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  else if (s === 'year') arr.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
  // 'new' = keep server order (already newest first)
  return arr;
}

function render() {
  const list = sortList(ALL.filter(matches));
  const total = ALL.length;
  const rated = ALL.filter((m) => m.rating > 0);
  const avg = rated.length ? (rated.reduce((s, m) => s + m.rating, 0) / rated.length).toFixed(1) : '—';
  $('stats').textContent = `${total} записей · показано ${list.length} · средняя оценка ${avg}`;

  if (!list.length) {
    $('grid').innerHTML = '';
    $('empty').style.display = 'block';
    return;
  }
  $('empty').style.display = 'none';
  $('grid').innerHTML = list.map((m, i) => card(m, i)).join('');
  document.querySelectorAll('.film').forEach((el) =>
    el.addEventListener('click', () => openModal(Number(el.dataset.id))));
}

function poster(m, cls) {
  return m.poster
    ? `<img class="${cls}" src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;noposter&quot;>🎬</div>'">`
    : `<div class="noposter">🎬</div>`;
}

function card(m) {
  const rate = m.rating > 0 ? `<span class="badge-rate">★ ${m.rating}</span>` : '';
  const kindCls = m.kind === 'series' ? 'k-series' : 'k-movie';
  const fav = m.favorite ? `<span class="fav">⭐</span>` : '';
  const sub = [m.year, m.status && STATUS_LABEL[m.status] !== 'Посмотрено' ? STATUS_LABEL[m.status] : '']
    .filter(Boolean).join(' · ');
  return `<div class="film" data-id="${m.id}">
    ${poster(m, 'poster')}
    <span class="badge-kind ${kindCls}">${esc(KIND_LABEL[m.kind] || m.kind)}</span>
    ${rate}${fav}
    <div class="meta">
      <h3>${esc(m.title)}</h3>
      <div class="sub">${esc(sub)}</div>
    </div>
  </div>`;
}

function openModal(id) {
  const m = ALL.find((x) => x.id === id);
  if (!m) return;
  const genres = splitGenres(m.genres).map((g) => `<span class="tag">${esc(g)}</span>`).join('');
  const rows = [];
  if (m.director) rows.push(['Режиссёр', m.director]);
  if (m.year) rows.push(['Год', m.year]);
  rows.push(['Тип', KIND_LABEL[m.kind] || m.kind]);
  if (m.status) rows.push(['Статус', STATUS_LABEL[m.status] || m.status]);
  if (m.watched_at) rows.push(['Просмотрено', m.watched_at]);
  const metaRows = rows.map(([k, v]) =>
    `<div style="display:flex;gap:10px;font-size:14px;margin-bottom:6px"><span style="color:#9aa0ab;min-width:110px">${esc(k)}</span><span style="color:#14161c">${esc(v)}</span></div>`).join('');

  $('modal-content').innerHTML = `
    <div class="head">
      ${poster(m, '')}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
          <h2 style="font-size:24px;font-weight:700">${esc(m.title)}</h2>
          ${m.favorite ? '<span style="font-size:18px">⭐</span>' : ''}
        </div>
        ${m.rating > 0 ? `<div class="mono" style="font-size:22px;color:#2563eb;font-weight:600;margin-bottom:14px">★ ${m.rating}<span style="color:#9aa0ab;font-size:14px">/10</span></div>` : ''}
        ${metaRows}
        <div style="margin-top:10px">${genres}</div>
      </div>
    </div>
    <div class="body">
      ${m.review ? `<div class="mono" style="font-size:12px;color:#2563eb;margin-bottom:10px">// рецензия</div><div class="review">${esc(m.review)}</div>` : '<div style="color:#9aa0ab;font-size:15px">Рецензия пока не написана.</div>'}
    </div>`;
  $('overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// --- events ---
$('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('close-modal').addEventListener('click', closeModal);
$('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

load();
