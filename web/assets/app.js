'use strict';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const ICONS = {
  telegram: '✈',
  github: '🐙',
  email: '📧',
  phone: '📞',
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el && value != null && value !== '') el.textContent = value;
}

// ---------- Render site data ----------

function socialCard(icon, label, handle, url) {
  return `<a href="${esc(url)}" class="gc social-card" ${url.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>
    <span class="social-card__icon">${icon}</span>
    <span>
      <div class="social-card__label">${esc(label)}</div>
      <div class="social-card__handle">${esc(handle)}</div>
    </span>
  </a>`;
}

function render(data) {
  const p = data.profile || {};

  setText('hero-last', (p.last_name || '').toUpperCase());
  setText('hero-first', p.first_name);
  const cursor = document.querySelector('.hero__cursor');
  const firstEl = document.getElementById('hero-first');
  if (firstEl && cursor) firstEl.appendChild(cursor);
  setText('hero-role', p.role);
  setText('hero-loc', p.location);
  setText('status-city', (p.location || '').split('/')[0].trim());
  setText('footer-copy', `© 2026 ${p.first_name || ''} ${p.last_name || ''}`.trim());

  const favImg = document.getElementById('fav-img');
  const heroImgSrc = p.photo || '/uploads/photo.jpg';
  if (favImg) { favImg.src = heroImgSrc; favImg.onerror = () => { favImg.style.opacity = '0'; }; }

  if (p.telegram) {
    const tg = document.getElementById('bento-tg');
    if (tg) { tg.href = 'https://t.me/' + p.telegram; tg.textContent = '✈ @' + p.telegram; }
    const fh = document.getElementById('footer-handle');
    if (fh) { fh.href = 'https://t.me/' + p.telegram; fh.textContent = '@' + p.telegram; }
  }
  if (p.resume) document.getElementById('resume-link').href = p.resume;
  document.title = `${p.first_name || ''} ${p.last_name || ''} — Разработчик`.trim();

  setText('about-ru', p.about_ru);
  setText('about-en', p.about_en);
  setText('bento-desc', (p.about_ru || '').split('.')[0] + (p.about_ru ? '.' : ''));

  const facts = [];
  if (p.location) facts.push({ label: 'ГОРОД', value: p.location.split('/')[0].trim() });
  if (p.age) facts.push({ label: 'ВОЗРАСТ', value: p.age });
  if (p.role) facts.push({ label: 'НАПРАВЛЕНИЕ', value: p.role });
  facts.push({ label: 'ЯЗЫКИ', value: 'RU & EN' });
  document.getElementById('facts-list').innerHTML = facts.map((f) => `
    <div class="facts__item">
      <div class="facts__item-label">${esc(f.label)}</div>
      <div class="facts__item-value">${esc(f.value)}</div>
    </div>`).join('');

  // Interests
  const interestIcons = ['♩', '◉', '⚙', '🌍'];
  document.getElementById('interests-grid').innerHTML = (data.interests || [])
    .map((it, i) => `<div class="gc interest-card" data-fade>
      <div class="interest-card__icon">${esc(it.symbol || interestIcons[i % interestIcons.length])}</div>
      <div class="interest-card__name">${esc(it.title)}</div>
      <div class="interest-card__desc">${esc(it.description || it.subtitle || '')}</div>
    </div>`).join('');

  // Skills
  document.getElementById('skills-grid').innerHTML = (data.skills || [])
    .map((g) => `<div class="gc skill-card" data-fade>
      <div class="skill-card__cat">${esc(g.title)}</div>
      <div class="skill-card__tags">${(g.skills || []).map((s) =>
        `<span class="skill-tag${s.highlight ? ' skill-tag--hl' : ''}">${esc(s.name)}</span>`).join('')}</div>
    </div>`).join('');

  // Core stack mini-bars (top-highlighted skills across groups)
  const highlighted = (data.skills || []).flatMap((g) => (g.skills || []).filter((s) => s.highlight));
  const stackPct = [92, 85, 80, 76];
  document.getElementById('stack-bars').innerHTML = highlighted.slice(0, 4).map((s, i) => `
    <div class="stack-bar">
      <div class="stack-bar__row">
        <span class="stack-bar__name">${esc(s.name)}</span>
        <span class="stack-bar__pct">${stackPct[i] || 70}%</span>
      </div>
      <div class="stack-bar__track"><div class="stack-bar__fill" style="width:${stackPct[i] || 70}%"></div></div>
    </div>`).join('');

  // Activity bars (decorative, seeded from project count)
  const projCount = (data.projects || []).length;
  setText('proj-count', projCount + '+');
  const bars = [28, 42, 55, 38, 68, 60, 80, 74, 88, 82, 94, 86];
  document.getElementById('activity-bars').innerHTML = bars.map((h) =>
    `<div class="card-activity__bar" style="height:${h}%;opacity:${(0.28 + (h / 100) * 0.72).toFixed(2)}"></div>`).join('');

  // Education
  document.getElementById('edu-list').innerHTML = (data.education || [])
    .map((e) => `<div class="gc edu-card" data-fade>
      <div class="edu-card__period">${esc(e.period)}</div>
      <div class="edu-card__inst">${esc(e.institution)}</div>
      <div class="edu-card__major">${esc(e.major)}</div>
      ${e.description ? `<p class="edu-card__desc">${esc(e.description)}</p>` : ''}
    </div>`).join('');

  // Projects
  document.getElementById('projects-grid').innerHTML = (data.projects || [])
    .map((pr, i) => `<div class="gc project-card" data-fade>
      <div class="project-card__num">${String(i + 1).padStart(2, '0')}</div>
      <div class="project-card__tag">${esc((pr.stack || '').split('·')[0].trim())}</div>
      <div class="project-card__title">${esc(pr.title)}</div>
      ${pr.metrics ? `<div class="project-card__metrics">${esc(pr.metrics)}</div>` : ''}
      <p class="project-card__desc">${esc(pr.description)}</p>
      <div class="project-card__stack">${(pr.stack || '').split('·').map((s) => `<span>${esc(s.trim())}</span>`).join('')}</div>
      ${pr.url ? `<a class="project-card__link" href="${esc(pr.url)}" target="_blank" rel="noopener">GitHub →</a>` : ''}
    </div>`).join('');

  // Contacts / socials
  const cards = [];
  if (p.telegram) cards.push(socialCard(ICONS.telegram, 'Telegram', '@' + p.telegram, 'https://t.me/' + p.telegram));
  if (p.github) cards.push(socialCard(ICONS.github, 'GitHub', p.github, 'https://github.com/' + p.github));
  if (p.email) cards.push(socialCard(ICONS.email, 'Email', p.email, 'mailto:' + p.email));
  if (p.phone) cards.push(socialCard(ICONS.phone, 'Телефон', p.phone, 'tel:' + p.phone.replace(/[^+\d]/g, '')));
  document.getElementById('socials-grid').innerHTML = cards.join('');

  observeFades();
  document.getElementById('app').setAttribute('aria-busy', 'false');
}

function observeFades() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -48px 0px' });
  document.querySelectorAll('[data-fade]:not(.is-visible)').forEach((el) => obs.observe(el));
}

function initForm() {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('cform-status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('.cform__btn');
    const fd = new FormData(form);
    const payload = {
      name: (fd.get('name') || '').trim(),
      email: (fd.get('email') || '').trim(),
      message: (fd.get('message') || '').trim(),
    };
    status.className = 'cform__status';
    status.textContent = 'Отправка…';
    btn.disabled = true;
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        status.textContent = 'Спасибо! Сообщение отправлено.';
        status.className = 'cform__status cform__status--ok';
        form.reset();
      } else {
        status.textContent = data.error || 'Не удалось отправить.';
        status.className = 'cform__status cform__status--err';
      }
    } catch (_) {
      status.textContent = 'Ошибка сети. Попробуйте позже.';
      status.className = 'cform__status cform__status--err';
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Blog ----------

const blogState = { offset: 0, limit: 10, loading: false };

function timeAgo(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function postCard(post) {
  const photos = post.photos || [];
  const photosHtml = photos.length ? `<div class="post-card__photos post-card__photos--n${Math.min(photos.length, 4)}">${
    photos.map((ph, i) => `<button type="button" class="post-card__photo" data-post="${post.id}" data-index="${i}">
      <img src="${esc(ph.url)}" loading="lazy" alt="">
    </button>`).join('')
  }</div>` : '';

  const reactionsHtml = (post.reactions || []).map((rc) => `
    <button type="button" class="reaction${rc.reacted ? ' reaction--active' : ''}" data-post="${post.id}" data-emoji="${esc(rc.emoji)}">
      <span>${rc.emoji}</span>${rc.count > 0 ? `<span class="reaction__count">${rc.count}</span>` : ''}
    </button>`).join('');

  return `<article class="gc post-card" data-fade data-post-id="${post.id}">
    <div class="post-card__meta">
      <span class="card-blog__tag">Post</span>
      <span class="post-card__meta-date">${esc(timeAgo(post.created_at))}</span>
    </div>
    <h3 class="post-card__title">${esc(post.title)}</h3>
    <p class="post-card__body">${esc(post.body)}</p>
    ${photosHtml}
    <div class="reactions">${reactionsHtml}</div>
  </article>`;
}

async function loadBlog(reset) {
  if (blogState.loading) return;
  if (reset) blogState.offset = 0;
  blogState.loading = true;
  const feed = document.getElementById('blog-feed');
  const moreBtn = document.getElementById('blog-more');
  try {
    const res = await fetch(`/api/blog/posts?limit=${blogState.limit}&offset=${blogState.offset}`);
    const data = await res.json();
    const posts = data.posts || [];
    const html = posts.map(postCard).join('');
    feed.innerHTML = reset ? html : feed.innerHTML + html;
    blogState.offset += posts.length;
    moreBtn.classList.toggle('hidden', !data.has_more);
    if (!feed.innerHTML) feed.innerHTML = '<p class="blog-empty">Записей пока нет.</p>';
    bindPostInteractions(feed);
    observeFades();

    if (reset && posts.length) {
      const latest = posts[0];
      setText('blog-teaser-title', latest.title);
      setText('blog-teaser-date', timeAgo(latest.created_at));
    }
  } catch (err) {
    console.error('Failed to load blog:', err);
    if (reset) feed.innerHTML = '<p class="blog-empty">Не удалось загрузить блог.</p>';
  } finally {
    blogState.loading = false;
  }
}

function bindPostInteractions(scope) {
  scope.querySelectorAll('.post-card__photo').forEach((btn) => {
    btn.addEventListener('click', () => {
      const article = btn.closest('.post-card');
      const photos = Array.from(article.querySelectorAll('.post-card__photo img')).map((img) => img.src);
      openLightbox(photos, Number(btn.dataset.index));
    });
  });
  scope.querySelectorAll('.reaction').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/blog/posts/${btn.dataset.post}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji: btn.dataset.emoji }),
        });
        const data = await res.json();
        if (res.ok) {
          const article = btn.closest('.post-card');
          const reactionsEl = article.querySelector('.reactions');
          reactionsEl.innerHTML = (data.reactions || []).map((rc) => `
            <button type="button" class="reaction${rc.reacted ? ' reaction--active' : ''}" data-post="${article.dataset.postId}" data-emoji="${esc(rc.emoji)}">
              <span>${rc.emoji}</span>${rc.count > 0 ? `<span class="reaction__count">${rc.count}</span>` : ''}
            </button>`).join('');
          bindPostInteractions(reactionsEl);
        }
      } catch (_) { /* ignore, button re-enables below */ }
      finally { btn.disabled = false; }
    });
  });
}

// ---------- Lightbox ----------

const lightboxState = { photos: [], index: 0 };

function openLightbox(photos, index) {
  lightboxState.photos = photos;
  lightboxState.index = index;
  updateLightbox();
  document.getElementById('lightbox').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.body.style.overflow = '';
}
function updateLightbox() {
  const { photos, index } = lightboxState;
  document.getElementById('lightbox-img').src = photos[index];
  document.getElementById('lightbox-counter').textContent = `${index + 1} / ${photos.length}`;
}
function lightboxStep(delta) {
  const n = lightboxState.photos.length;
  lightboxState.index = (lightboxState.index + delta + n) % n;
  updateLightbox();
}

function initLightbox() {
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', () => lightboxStep(-1));
  document.getElementById('lightbox-next').addEventListener('click', () => lightboxStep(1));
  const box = document.getElementById('lightbox');
  box.addEventListener('click', (e) => { if (e.target === box) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (box.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lightboxStep(-1);
    if (e.key === 'ArrowRight') lightboxStep(1);
  });
  let touchStartX = null;
  box.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) lightboxStep(dx < 0 ? 1 : -1);
    touchStartX = null;
  }, { passive: true });
}

// ---------- Music ----------

const MONTH_NAMES = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function monthLabel(monthStr) {
  if (!monthStr) return '// top tracks';
  const [y, m] = monthStr.split('-').map(Number);
  return `// топ за ${MONTH_NAMES[m - 1]} ${y}`;
}

async function loadNowPlaying() {
  const el = document.getElementById('music-now');
  const bento = document.getElementById('bento-now');
  try {
    const res = await fetch('/api/spotify/now');
    const np = await res.json();
    if (!np.is_playing) {
      el.innerHTML = `<div class="music-now-card__label"><span class="music-now-card__dot"></span>now playing · spotify</div>
        <div class="music-now-card--empty">
          <div class="music-now-card__ph">♪</div>
          <div>Сейчас ничего не играет</div>
        </div>`;
      if (bento) bento.innerHTML = `<div class="card-now__label"><span class="card-now__dot"></span>now playing</div><div class="card-now-content card-now--empty">Сейчас тихо</div>`;
      return;
    }
    el.innerHTML = `
      <div class="music-now-card__label"><span class="music-now-card__dot"></span>now playing · spotify</div>
      <div class="music-now-card__row">
        <div class="music-now-card__art">${np.image_url ? `<img src="${esc(np.image_url)}" alt="">` : '♫'}</div>
        <div>
          <div class="music-now-card__track">${esc(np.track_name)}</div>
          <div class="music-now-card__artist">${esc(np.artist_name)}</div>
        </div>
      </div>
      <div class="eq"><span></span><span></span><span></span><span></span><span></span><span></span></div>
      ${np.track_url ? `<a class="music-now-card__link" href="${esc(np.track_url)}" target="_blank" rel="noopener">Слушать →</a>` : ''}
    `;
    if (bento) {
      bento.innerHTML = `
        <div class="card-now__label"><span class="card-now__dot"></span>now playing</div>
        <div class="card-now__row">
          <div class="card-now__art">${np.image_url ? `<img src="${esc(np.image_url)}" alt="">` : '♫'}</div>
          <div style="min-width:0">
            <div class="card-now__track">${esc(np.track_name)}</div>
            <div class="card-now__artist">${esc(np.artist_name)}</div>
          </div>
        </div>
        <div class="eq"><span></span><span></span><span></span><span></span><span></span><span></span></div>`;
    }
  } catch (err) {
    console.error('Failed to load now playing:', err);
  }
}

async function loadTop() {
  const el = document.getElementById('music-top');
  try {
    const res = await fetch('/api/spotify/top');
    const data = await res.json();
    const tracks = data.tracks || [];
    const artists = data.artists || [];
    document.getElementById('music-top-label').textContent = monthLabel(data.month);
    if (!tracks.length && !artists.length) {
      el.innerHTML = '<p class="blog-empty">Пока нет данных за этот месяц.</p>';
      return;
    }
    const trackList = tracks.map((it, i) => `
      <div class="top-item">
        <span class="top-item__rank">${i + 1}</span>
        <span class="top-item__img">${it.image_url ? `<img src="${esc(it.image_url)}" alt="">` : '♪'}</span>
        <span class="top-item__text">
          <span class="top-item__name">${esc(it.track_name)}</span>
          <span class="top-item__sub">${esc(it.artist_name)}</span>
        </span>
        <span class="top-item__count">${it.play_count}×</span>
      </div>`).join('');
    const artistList = artists.map((it, i) => `
      <div class="top-item">
        <span class="top-item__rank">${i + 1}</span>
        <span class="top-item__img">${it.image_url ? `<img src="${esc(it.image_url)}" alt="">` : '☺'}</span>
        <span class="top-item__text">
          <span class="top-item__name">${esc(it.artist_name)}</span>
        </span>
        <span class="top-item__count">${it.play_count}×</span>
      </div>`).join('');
    el.innerHTML = `
      <div class="top-col">
        <div class="top-col__label">Треки</div>
        ${trackList || '<p class="blog-empty">Нет данных.</p>'}
      </div>
      <div class="top-col">
        <div class="top-col__label">Артисты</div>
        ${artistList || '<p class="blog-empty">Нет данных.</p>'}
      </div>`;
  } catch (err) {
    console.error('Failed to load top items:', err);
  }
}

function loadMusic() {
  loadNowPlaying();
  loadTop();
  setInterval(loadNowPlaying, 30000);
}

// ---------- Theme + nav visuals ----------

const THEME_VARS = {
  dark: {
    '--bg': '#070B18', '--bg2': '#0D1425', '--t1': '#E8F4FF', '--t2': '#7A9BB8', '--t3': '#3D5A75',
    '--ac': '#22D3EE', '--ac2': '#818CF8', '--navbg': 'rgba(7,11,24,.9)',
  },
  light: {
    '--bg': '#F0F6FF', '--bg2': '#E0EAFF', '--t1': '#0F172A', '--t2': '#475569', '--t3': '#94A3B8',
    '--ac': '#2563EB', '--ac2': '#6366F1', '--navbg': 'rgba(240,246,255,.92)',
  },
};

function applyTheme(theme) {
  const root = document.documentElement;
  Object.entries(THEME_VARS[theme]).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute('data-theme', theme);
  try { localStorage.setItem('ms-theme', theme); } catch (_) { /* ignore */ }
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '🌙';
  setTimeout(initSparkline, 60);
}

function initThemeToggle() {
  const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('ms-theme')) || 'dark';
  applyTheme(saved);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
}

function initMobileMenu() {
  const btn = document.getElementById('menu-toggle');
  const menu = document.getElementById('mobile-menu');
  btn.addEventListener('click', () => menu.classList.toggle('hidden'));
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => menu.classList.add('hidden')));
}

// ---------- Scroll: nav glass, floating avatar, orb parallax ----------

let avatarStart = null;
let mouse = { x: 0, y: 0 };

function computeAvatarStart() {
  const rings = document.getElementById('hero-rings');
  const size = 180;
  if (rings) {
    const r = rings.getBoundingClientRect();
    avatarStart = { x: r.left + r.width / 2 - size / 2, y: r.top + r.height / 2 - size / 2 };
  } else {
    avatarStart = { x: window.innerWidth / 2 - 90, y: 320 };
  }
}

function refreshAvatarPosition() {
  avatarStart = null;
  if (window.scrollY < 4) setAvatarStart();
  else handleScroll();
}

function handleScroll() {
  const sy = window.scrollY;
  const H = window.innerHeight;
  const W = window.innerWidth;

  const nav = document.getElementById('nav');
  if (nav) {
    const on = sy > 40;
    nav.style.background = on ? 'var(--navbg)' : 'transparent';
    nav.style.backdropFilter = on ? 'blur(26px) saturate(160%)' : 'none';
    nav.style.webkitBackdropFilter = on ? 'blur(26px) saturate(160%)' : 'none';
    nav.style.boxShadow = on ? '0 1px 0 rgba(255,255,255,.06)' : 'none';
  }

  const fav = document.getElementById('fav');
  if (fav && fav.classList.contains('ready')) {
    if (!avatarStart) computeAvatarStart();
    const isMobile = W <= 720;
    const p = Math.min(Math.max(sy / (H * (isMobile ? 0.55 : 0.38)), 0), 1);
    const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const sx = avatarStart ? avatarStart.x : W / 2 - 90;
    const sy0 = avatarStart ? avatarStart.y : 320;
    const fb = document.getElementById('fav-fb');

    if (isMobile) {
      // mobile navbar too small, just fade out instead of flying there
      fav.style.left = sx + 'px';
      fav.style.top = sy0 + 'px';
      fav.style.width = '180px';
      fav.style.height = '180px';
      fav.style.transform = 'none';
      fav.style.opacity = (1 - ease).toFixed(3);
      if (fb) fb.style.fontSize = '28px';
    } else {
      const ex = W - 94, ey = 13;
      const ss = 180, es = 38;
      const cx = sx + (ex - sx) * ease;
      const cy = sy0 + (ey - sy0) * ease;
      const cs = ss + (es - ss) * ease;
      fav.style.left = cx + 'px';
      fav.style.top = cy + 'px';
      fav.style.width = cs + 'px';
      fav.style.height = cs + 'px';
      fav.style.transform = 'none';
      fav.style.opacity = '1';
      if (fb) fb.style.fontSize = Math.max(9, 28 * (1 - ease)) + 'px';
    }
  }

  const orb = document.getElementById('bg-orb');
  if (orb) {
    orb.style.top = (48 + sy * 0.04) + '%';
    orb.style.opacity = Math.max(0, 1 - sy / (H * 1.6)).toFixed(3);
  }
}

function setAvatarStart() {
  computeAvatarStart();
  const fav = document.getElementById('fav');
  if (!fav || !avatarStart) return;
  fav.style.left = avatarStart.x + 'px';
  fav.style.top = avatarStart.y + 'px';
  fav.style.width = '180px';
  fav.style.height = '180px';
  fav.style.transform = 'none';
}

// hero has a float-in animation that moves the rings, so hide avatar
// until it's done or it looks glitchy
function revealAvatarWhenStable() {
  const fav = document.getElementById('fav');
  const heroInner = document.querySelector('.hero__inner');
  if (!fav) return;
  const finish = () => {
    avatarStart = null;
    setAvatarStart();
    if (window.scrollY > 4) handleScroll();
    requestAnimationFrame(() => fav.classList.add('ready'));
  };
  if (heroInner) {
    heroInner.addEventListener('animationend', finish, { once: true });
    // fallback in case animation gets skipped somehow
    setTimeout(finish, 950);
  } else {
    finish();
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => refreshAvatarPosition());
  }
}

// ---------- Canvas background (stars + terrain) ----------

let canvasRaf = null;
let canvasT = 0;

function initCanvas() {
  const cv = document.getElementById('bg-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let W = 0, H = 0;

  const resize = () => { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; };
  resize();
  let rzT;
  window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { resize(); initSparkline(); }, 120); });

  const STARS = Array.from({ length: 88 }, () => ({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.7 + 0.28, a: Math.random() * 0.55 + 0.1,
    vx: (Math.random() - 0.5) * 0.00016, vy: (Math.random() - 0.5) * 0.00016, depth: Math.random(),
  }));

  const C = 30, R = 14;
  const vtx = (xi, yi, t) => {
    const nx = xi / (C - 1), ny = yi / (R - 1);
    const h = (
      Math.sin(nx * Math.PI * 3.2 + t * 0.65) * Math.cos(ny * Math.PI * 2.3 - t * 0.48) * 0.72 +
      Math.sin(nx * Math.PI * 6.8 - t * 1.05) * Math.sin(ny * Math.PI * 4.1 + t * 0.75) * 0.38 +
      Math.sin(nx * Math.PI * 12 + t * 0.38) * Math.cos(ny * Math.PI * 7.5 - t * 1.2) * 0.18
    );
    const cx = nx - 0.5, cy = ny - 0.5;
    const peak = Math.max(0, 1 - Math.sqrt(cx * cx * 2.8 + cy * cy * 5.5)) * 0.42;
    const fh = h * (0.38 + peak);
    return {
      x: W * 0.5 + (nx - 0.5) * W * 1.3,
      y: H * 0.73 + (ny - 0.5) * H * 0.28 * 0.44 - fh * H * 0.31,
      h: fh,
    };
  };

  const draw = () => {
    canvasRaf = requestAnimationFrame(draw);
    canvasT += 0.013;
    const t = canvasT;
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const AC = dark ? '34,211,238' : '37,99,235';
    const AC2 = dark ? '99,102,241' : '79,70,229';
    const mx = mouse.x / (W || 1);
    const my = mouse.y / (H || 1);

    ctx.clearRect(0, 0, W, H);

    STARS.forEach((s) => {
      s.x = ((s.x + s.vx) + 1) % 1;
      s.y = ((s.y + s.vy) + 1) % 1;
      const px = s.x * W + (s.x - (mx || 0.5)) * s.depth * -16;
      const py = s.y * H + (s.y - (my || 0.5)) * s.depth * -12;
      if (dark && s.r > 1.1) { ctx.shadowColor = `rgba(${AC},0.9)`; ctx.shadowBlur = 6; }
      ctx.fillStyle = `rgba(${AC},${(s.a * (dark ? 1 : 0.45)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(px, py, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });

    for (let i = 0; i < STARS.length; i++) {
      for (let j = i + 1; j < STARS.length; j++) {
        const dx = (STARS[i].x - STARS[j].x) * W;
        const dy = (STARS[i].y - STARS[j].y) * H;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) {
          const a = (1 - d / 130) * (dark ? 0.17 : 0.055);
          ctx.strokeStyle = `rgba(${AC},${a.toFixed(3)})`;
          ctx.lineWidth = 0.4;
          ctx.beginPath(); ctx.moveTo(STARS[i].x * W, STARS[i].y * H); ctx.lineTo(STARS[j].x * W, STARS[j].y * H); ctx.stroke();
        }
      }
    }

    ctx.strokeStyle = `rgba(${AC2},${dark ? 0.04 : 0.022})`;
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 90) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    const tA = Math.max(0, 1 - window.scrollY / (H * 0.65));
    if (tA > 0.01) {
      ctx.globalAlpha = tA;
      for (let yi = 0; yi < R - 1; yi++) {
        for (let xi = 0; xi < C - 1; xi++) {
          const v0 = vtx(xi, yi, t), v1 = vtx(xi + 1, yi, t), v2 = vtx(xi + 1, yi + 1, t), v3 = vtx(xi, yi + 1, t);
          const avgH = (v0.h + v1.h + v2.h + v3.h) / 4;
          if (avgH > 0.025) {
            ctx.fillStyle = `rgba(${AC},${Math.min(avgH * 0.16, 0.092).toFixed(4)})`;
            ctx.beginPath(); ctx.moveTo(v0.x, v0.y); ctx.lineTo(v1.x, v1.y); ctx.lineTo(v2.x, v2.y); ctx.lineTo(v3.x, v3.y); ctx.closePath(); ctx.fill();
          }
        }
      }
      for (let yi = 0; yi < R; yi++) {
        for (let xi = 0; xi < C; xi++) {
          const v = vtx(xi, yi, t);
          if (xi < C - 1) {
            const vr = vtx(xi + 1, yi, t);
            const a = Math.max(0, (v.h + vr.h) * 0.8 + 0.1) * (dark ? 0.68 : 0.3);
            ctx.strokeStyle = `rgba(${AC},${Math.min(a, 0.56).toFixed(3)})`; ctx.lineWidth = 0.75;
            ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(vr.x, vr.y); ctx.stroke();
          }
          if (yi < R - 1) {
            const vd = vtx(xi, yi + 1, t);
            const a = Math.max(0, (v.h + vd.h) * 0.7 + 0.07) * (dark ? 0.42 : 0.18);
            ctx.strokeStyle = `rgba(${AC2},${Math.min(a, 0.36).toFixed(3)})`; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(vd.x, vd.y); ctx.stroke();
          }
          if (v.h > 0.11 && dark) {
            ctx.shadowColor = `rgba(${AC},0.95)`; ctx.shadowBlur = 14;
            ctx.fillStyle = `rgba(${AC},${Math.min(v.h * 2.8, 1).toFixed(2)})`;
            ctx.beginPath(); ctx.arc(v.x, v.y, Math.min(v.h * 3.2, 2.6), 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }
      ctx.globalAlpha = 1;
    }
  };
  draw();
}

function initSparkline() {
  const cv = document.getElementById('spark-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  cv.width = cv.offsetWidth * dpr;
  cv.height = cv.offsetHeight * dpr;
  const W = cv.width, H = cv.height;
  if (!W || !H) return;
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const data = [28, 40, 33, 58, 48, 72, 62, 78, 68, 88, 80, 94];
  const mn = Math.min(...data), mx2 = Math.max(...data);
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((v - mn) / (mx2 - mn)) * H * 0.78 - H * 0.11,
  }));
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, dark ? 'rgba(34,211,238,.28)' : 'rgba(37,99,235,.22)');
  g.addColorStop(1, 'transparent');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(pts[0].x, H);
  pts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, H); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = dark ? 'rgba(34,211,238,.85)' : 'rgba(37,99,235,.85)';
  ctx.lineWidth = 1.6 * dpr; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))); ctx.stroke();

  pts.forEach((p) => {
    ctx.fillStyle = dark ? 'rgba(34,211,238,.9)' : 'rgba(37,99,235,.9)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 * dpr, 0, Math.PI * 2); ctx.fill();
  });
}

// ---------- Init ----------

async function init() {
  initThemeToggle();
  initMobileMenu();
  initForm();
  initLightbox();
  initCanvas();
  setAvatarStart();
  revealAvatarWhenStable();
  setTimeout(initSparkline, 50);

  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => refreshAvatarPosition(), 150);
  });

  let scrollRaf = null;
  window.addEventListener('scroll', () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => { handleScroll(); scrollRaf = null; });
  }, { passive: true });
  window.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
  handleScroll();

  try {
    const res = await fetch('/api/site');
    if (!res.ok) throw new Error('bad status ' + res.status);
    render(await res.json());
  } catch (err) {
    console.error('Failed to load site data:', err);
    observeFades();
  }
  loadBlog(true);
  loadMusic();
}

document.getElementById('blog-more') && document.getElementById('blog-more').addEventListener('click', () => loadBlog(false));

document.addEventListener('DOMContentLoaded', init);
