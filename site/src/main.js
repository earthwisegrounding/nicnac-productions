import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles.css';

import Lenis from 'lenis';
import data from './data/tracks.json';
import eyeMeta from './data/eye.json';
import { site } from './data/site.js';
import { Player, fmt } from './player.js';
import { Hero } from './gl.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ catalogue order
// Most-played first ("the people's order"); ties broken by likes.
const tracks = [...data.tracks].sort((a, b) => b.plays - a.plays || b.likes - a.likes);
const favs = new Set([...tracks].sort((a, b) => b.likes - a.likes).slice(0, 2).map((t) => t.id));

// ------------------------------------------------------------------ smooth scroll
const lenis = reduced ? null : new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, anchors: { offset: 0 } });
if (lenis) {
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
const scrollTo = (target) => (lenis ? lenis.scrollTo(target, { offset: 0, duration: 1.4 }) : $(target)?.scrollIntoView({ behavior: 'smooth' }));
$$('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2 || !$(id)) return;
    e.preventDefault();
    scrollTo(id);
  }),
);

// ------------------------------------------------------------------ player
const player = new Player(tracks, $('#player'));

// ------------------------------------------------------------------ hero
let hero = null;
if (!reduced) {
  try {
    hero = new Hero($('#gl'), {
      eye: eyeMeta,
      eyeBase: 'media/eye',
      sources: {
        landscape: [
          { src: 'media/hero-1080.webm', type: 'video/webm; codecs="vp9"' },
          { src: 'media/hero-1080.mp4', type: 'video/mp4' },
        ],
        portrait: [
          { src: 'media/hero-portrait.webm', type: 'video/webm; codecs="vp9"' },
          { src: 'media/hero-portrait.mp4', type: 'video/mp4' },
        ],
      },
      audio: () => player.energy(),
      playing: () => player.playing,
    });
  } catch (err) {
    console.warn('WebGL hero unavailable, falling back to poster', err);
  }
}

if (import.meta.env.DEV) window.__nn = { hero, player, lenis };

// hero is only drawn while on screen (or in visualizer mode)
const heroEl = $('#top');
let heroOnScreen = true;
new IntersectionObserver(([e]) => {
  heroOnScreen = e.isIntersecting;
  hero?.setVisible(heroOnScreen || root.classList.contains('is-viz'));
}).observe(heroEl);
document.addEventListener('visibilitychange', () => { if (!document.hidden) hero?.setVisible(heroOnScreen || root.classList.contains('is-viz')); });

// hold to open the third eye
if (hero) {
  let holdTimer;
  const start = (e) => {
    if (e.target.closest('a, button, input, .nav')) return;
    if (e.pointerType === 'touch') {
      holdTimer = setTimeout(() => { hero.setHold(true); root.classList.add('is-tripping'); }, 220);
    } else {
      hero.setHold(true); root.classList.add('is-tripping');
    }
  };
  const end = () => { clearTimeout(holdTimer); hero.setHold(false); root.classList.remove('is-tripping'); };
  heroEl.addEventListener('pointerdown', start);
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
  heroEl.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => { if (e.key === 't' && !e.target.closest('input, textarea')) { hero.setHold(true); root.classList.add('is-tripping'); } });
  addEventListener('keyup', (e) => { if (e.key === 't') end(); });
  addEventListener('pointermove', (e) => { if (heroOnScreen || root.classList.contains('is-viz')) hero.pointer(e.clientX, e.clientY); }, { passive: true });
}

// hero timecode (24 fps, like the render)
const clock = $('[data-clock]');
const t0 = performance.now();
const tick = () => {
  if (heroOnScreen) {
    const f = Math.floor(((performance.now() - t0) / 1000) * 24);
    const pad = (n) => String(n).padStart(2, '0');
    clock.textContent = `TC ${pad(Math.floor(f / 86400) % 24)}:${pad(Math.floor(f / 1440) % 60)}:${pad(Math.floor(f / 24) % 60)}:${pad(f % 24)}`;
  }
  requestAnimationFrame(tick);
};
tick();

$('[data-play-first]').addEventListener('click', () => {
  player.play(player.index < 0 ? 0 : player.index);
  scrollTo('#vault');
});

// ------------------------------------------------------------------ vault list
const list = $('[data-tracks]');
list.innerHTML = tracks
  .map((t, i) => {
    const tags = [t.sold && '<span class="tag tag--sold">Sold</span>', favs.has(t.id) && '<span class="tag">Fan fave</span>']
      .filter(Boolean)
      .join('');
    return `<li class="track" data-i="${i}">
      <button class="track__btn" type="button" data-cursor="play" aria-label="Play ${t.title}">
        <span class="track__num mono">${String(i + 1).padStart(2, '0')}</span>
        <span class="track__title">${t.title}</span>
        <span class="track__tags">${tags}</span>
        <span class="track__year mono">${t.year}</span>
        <span class="track__dur mono">${fmt(t.duration)}</span>
        <span class="track__icon" aria-hidden="true"><svg class="i-play"><use href="#i-play"/></svg><svg class="i-pause"><use href="#i-pause"/></svg></span>
      </button>
      <div class="track__bar" aria-hidden="true"><i></i></div>
    </li>`;
  })
  .join('');
$('[data-track-count]').textContent = `${tracks.length} beats`;
$('#vault-title').innerHTML = `${numberWord(tracks.length)} beats.<br /><em>One eye.</em>`;

const rows = $$('.track', list);
list.addEventListener('click', (e) => {
  const li = e.target.closest('.track');
  if (!li) return;
  const i = +li.dataset.i;
  if (i === player.index) player.toggle();
  else player.play(i);
});

// artwork peek follows the cursor, clipped to a triangle
const peek = $('.peek');
const peekImg = $('img', peek);
const pk = { x: 0, y: 0, tx: 0, ty: 0, on: false };
if (finePointer) {
  list.addEventListener('pointermove', (e) => { pk.tx = e.clientX; pk.ty = e.clientY; });
  list.addEventListener('pointerover', (e) => {
    const li = e.target.closest('.track');
    if (!li) return;
    const t = tracks[+li.dataset.i];
    if (!peekImg.src.endsWith(t.art)) peekImg.src = t.art;
    peek.classList.toggle('is-color', +li.dataset.i === player.index);
    peek.classList.add('is-on'); pk.on = true;
  });
  list.addEventListener('pointerleave', () => { peek.classList.remove('is-on'); pk.on = false; });
  const peekLoop = () => {
    pk.x = lerp(pk.x, pk.tx, 0.14); pk.y = lerp(pk.y, pk.ty, 0.14);
    const tilt = Math.max(-14, Math.min(14, (pk.tx - pk.x) * 0.12));
    peek.style.transform = `translate3d(${pk.x}px, ${pk.y}px, 0) translate(-50%, -58%) rotate(${tilt}deg) scale(${pk.on ? 1 : 0.6})`;
    requestAnimationFrame(peekLoop);
  };
  peekLoop();
}

// ------------------------------------------------------------------ marquee
const mq = $('[data-marquee]');
const sep = '<span class="marquee__sep"><svg viewBox="0 0 24 21"><path d="M12 1 L23 20 H1 Z" fill="none" stroke="#d4a64a" stroke-width="2"/></svg></span>';
const mqHtml = tracks.map((t, i) => `<span class="marquee__item" data-i="${i}">${t.title}${sep}</span>`).join('');
mq.innerHTML = mqHtml + mqHtml;
mq.addEventListener('click', (e) => {
  const it = e.target.closest('.marquee__item');
  if (it) player.play(+it.dataset.i);
});
let mqX = 0, mqV = 0;
const mqLoop = () => {
  const half = mq.scrollWidth / 2;
  const vel = lenis ? lenis.velocity : 0;
  mqV = lerp(mqV, 1.1 + Math.abs(vel) * 0.6, 0.08);
  const dir = vel < -0.5 ? -1 : 1;
  mqX -= mqV * dir;
  if (mqX <= -half) mqX += half;
  if (mqX > 0) mqX -= half;
  mq.style.transform = `translate3d(${mqX}px,0,0)`;
  requestAnimationFrame(mqLoop);
};
if (!reduced) mqLoop();

// ------------------------------------------------------------------ player <-> page
player.addEventListener('track', ({ detail: { index } }) => {
  rows.forEach((r, i) => r.classList.toggle('is-current', i === index));
  $$('.marquee__item', mq).forEach((m) => m.classList.toggle('is-current', +m.dataset.i === index));
  $('[data-viz-title]').textContent = tracks[index].title;
  document.title = `▶ ${tracks[index].title} — NicNac Productions`;
});
player.addEventListener('state', ({ detail: { state, index } }) => {
  rows.forEach((r, i) => {
    const on = i === index && (state === 'playing' || state === 'loading');
    r.classList.toggle('is-playing', on);
    $('.track__btn', r).setAttribute('aria-label', `${on ? 'Pause' : 'Play'} ${tracks[i].title}`);
  });
  if (state === 'paused') document.title = 'NicNac Productions — Hip-Hop & R&B Beats, Songwriting, Mixing';
});
player.addEventListener('locate', () => {
  const r = rows[player.index];
  if (r) scrollTo(r);
});

// progress: waveform + row bar + time, one rAF
const posEl = $('[data-p="pos"]'), waveEl = $('[data-p="wave"]');
let lastSec = -1;
const progressLoop = () => {
  if (player.index >= 0) {
    const pos = player.position(), p = player.dur ? pos / player.dur : 0;
    player.wave.draw(p);
    rows[player.index]?.style.setProperty('--p', p.toFixed(4));
    const s = Math.floor(pos / 1000);
    if (s !== lastSec) {
      lastSec = s;
      posEl.textContent = fmt(pos);
      waveEl.setAttribute('aria-valuenow', Math.round(p * 100));
      waveEl.setAttribute('aria-valuetext', `${fmt(pos)} of ${fmt(player.dur)}`);
    }
  }
  requestAnimationFrame(progressLoop);
};
progressLoop();

// visualizer: the hero canvas goes full-screen over the page
const viz = $('#viz');
const setViz = (on) => {
  root.classList.toggle('is-viz', on);
  viz.hidden = !on;
  lenis?.[on ? 'stop' : 'start']();
  hero?.setScroll(on ? 0 : scrollY / heroEl.offsetHeight);
  hero?.setVisible(on || heroOnScreen);
};
$('[data-p="viz"]').addEventListener('click', () => setViz(!root.classList.contains('is-viz')));
$('[data-p="viz-close"]').addEventListener('click', () => setViz(false));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('is-viz')) setViz(false); });
if (!hero) $('[data-p="viz"]').hidden = true;

// ------------------------------------------------------------------ about: words light up with scroll
const statement = $('[data-words]');
{
  const walk = (node, gold = false) => {
    const out = [];
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach((w) => out.push(/\S/.test(w) ? `<span class="w${gold ? ' g' : ''}">${w}</span>` : w));
      else out.push(...walk(n, n.tagName === 'B'));
    });
    return out;
  };
  statement.innerHTML = walk(statement).join('');
}
const words = $$('.w', statement);
const aboutTrack = $('[data-about-track]');
const aboutEye = $('.about__eye');
const aboutLoop = () => {
  const r = aboutTrack.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (-r.top + innerHeight * 0.35) / (r.height - innerHeight * 0.6)));
  aboutEye.style.setProperty('--k', Math.min(1, Math.max(0.08, p * 1.5)).toFixed(4));
  const lit = Math.round(p * words.length);
  words.forEach((w, i) => {
    w.classList.toggle('is-lit', i < lit);
    w.classList.toggle('is-gold', i < lit && w.classList.contains('g'));
  });
};

// ------------------------------------------------------------------ nav + scroll-linked bits
const nav = $('#nav');
const navLinks = $$('.nav__links a');
const sections = navLinks.map((a) => $(a.getAttribute('href')));
let lastY = scrollY;
const onScroll = () => {
  const y = scrollY;
  const h = heroEl.offsetHeight;
  nav.classList.toggle('is-solid', y > h * 0.6);
  nav.classList.toggle('is-hidden', y > h && y > lastY + 2 && !root.classList.contains('is-viz'));
  if (y < lastY - 2) nav.classList.remove('is-hidden');
  lastY = y;
  if (!root.classList.contains('is-viz')) hero?.setScroll(y / h);
  aboutLoop();
  const mid = innerHeight * 0.4;
  navLinks.forEach((a, i) => {
    const r = sections[i].getBoundingClientRect();
    a.classList.toggle('is-active', r.top < mid && r.bottom > mid);
  });
};
(lenis ? lenis.on('scroll', onScroll) : addEventListener('scroll', onScroll, { passive: true }));
onScroll();

// the nav logo's iris watches the cursor too
const navEye = $('.mark--nav');
addEventListener('pointermove', (e) => {
  const r = navEye.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.537);
  const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 300);
  navEye.style.setProperty('--ex', `${(dx / d) * 9 * k}px`);
  navEye.style.setProperty('--ey', `${(dy / d) * 4 * k}px`);
}, { passive: true });

// mobile menu
const menu = $('#menu');
$('[data-menu-open]').addEventListener('click', () => menu.showModal());
$$('[data-menu-close]', menu).forEach((b) => b.addEventListener('click', (e) => {
  menu.close();
  const href = b.getAttribute('href');
  if (href) { e.preventDefault(); setTimeout(() => scrollTo(href), 50); }
}));

// ------------------------------------------------------------------ reveals
$$('.section-head, .svc, .steps li, .about__grid > *, .book__head, .form, .vault__foot').forEach((el) => el.classList.add('reveal'));
if (!CSS.supports('(animation-timeline: view()) and (animation-range: entry)') && !reduced) {
  root.classList.add('no-sda');
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
  $$('.reveal').forEach((el) => io.observe(el));
}

// ------------------------------------------------------------------ custom cursor
if (finePointer && !reduced) {
  root.classList.add('has-cursor');
  const cur = $('.cursor'), dot = $('.cursor__dot'), ring = $('.cursor__ring'), label = $('.cursor__label');
  const c = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
  addEventListener('pointermove', (e) => { c.x = e.clientX; c.y = e.clientY; }, { passive: true });
  addEventListener('pointerdown', () => cur.classList.add('is-down'));
  addEventListener('pointerup', () => cur.classList.remove('is-down'));
  const setMode = (target) => {
    const play = target.closest('[data-cursor="play"], .marquee__item');
    const inHero = !play && target.closest('.hero') && !target.closest('a, button');
    const hover = !play && target.closest('a, button, input, textarea, label, [role="slider"], .svc__card');
    cur.classList.toggle('is-label', !!(play || inHero));
    cur.classList.toggle('is-hold', !!inHero);
    cur.classList.toggle('is-hover', !!hover);
    if (play) {
      const li = play.closest('.track');
      label.textContent = li && +li.dataset.i === player.index && player.playing ? 'Pause' : 'Play';
    } else if (inHero) label.textContent = 'Hold';
  };
  addEventListener('pointerover', (e) => setMode(e.target), { passive: true });
  player.addEventListener('state', () => { const el = document.elementFromPoint(c.x, c.y); if (el) setMode(el); });
  const curLoop = () => {
    c.rx = lerp(c.rx, c.x, 0.2); c.ry = lerp(c.ry, c.y, 0.2);
    dot.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`;
    ring.style.transform = `translate3d(${c.rx}px, ${c.ry}px, 0)`;
    requestAnimationFrame(curLoop);
  };
  curLoop();
}

// ------------------------------------------------------------------ booking form (Netlify Forms)
const form = $('form[name="booking"]');
const status = $('.form__status', form);
if (site.email) {
  const li = $('[data-email]');
  li.hidden = false;
  $('a', li).href = `mailto:${site.email}`;
  $('[data-email-text]', li).textContent = site.email;
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  $$('.field', form).forEach((f) => f.classList.remove('is-invalid'));
  const bad = $$('input, textarea', form).filter((i) => i.name !== 'company' && !i.checkValidity());
  if (bad.length) {
    bad.forEach((i) => i.closest('.field')?.classList.add('is-invalid'));
    bad[0].focus();
    status.textContent = 'A couple of fields need a look.';
    status.className = 'form__status mono is-err';
    return;
  }
  const btn = $('.form__send', form);
  if (!/netlify|nicnacproductions\.store|localhost/.test(location.hostname)) {
    // static preview hosts (e.g. GitHub Pages) can't receive form posts
    status.innerHTML = `Online booking switches on at launch. For now, DM <a href="${site.instagram}" target="_blank" rel="noopener">@supremeonicnac</a> on Instagram.`;
    status.className = 'form__status mono is-err';
    return;
  }
  btn.disabled = true;
  status.textContent = 'Sending…';
  status.className = 'form__status mono';
  try {
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString(),
    });
    if (!res.ok) throw new Error(res.status);
    form.classList.add('is-sent');
    status.textContent = 'Received. The eye is on it. Expect a reply within 48 hours.';
    status.className = 'form__status mono is-ok';
  } catch {
    btn.disabled = false;
    status.innerHTML = `Couldn’t send just now. DM <a href="${site.instagram}" target="_blank" rel="noopener">@supremeonicnac</a> instead.`;
    status.className = 'form__status mono is-err';
  }
});

// ------------------------------------------------------------------ footer: the loop inside the letters
const fv = $('[data-foot-video]');
new IntersectionObserver(([e]) => {
  if (e.isIntersecting) {
    if (!fv.src) { fv.src = 'media/hero-720.mp4'; }
    if (!reduced) fv.play().catch(() => {});
  } else fv.pause();
}, { rootMargin: '200px' }).observe(fv);
$('[data-year]').textContent = new Date().getFullYear();

// ------------------------------------------------------------------ gate
const gate = $('#gate');
const enterBtns = $$('[data-enter]', gate);
const seen = sessionStorage.getItem('nn-entered');
const reveal = () => {
  $$('[inert]').forEach((el) => (el.inert = false));
  gate.classList.add('is-gone');
  root.classList.add('is-in');
  lenis?.start();
  sessionStorage.setItem('nn-entered', '1');
};
if (seen || reduced) {
  gate.remove();
  root.classList.add('is-in');
  player.warm(0);
} else {
  lenis?.stop();
  const behind = $$('body > :not(#gate):not(.cursor):not(.grain):not(svg)');
  behind.forEach((el) => (el.inert = true));
  const count = $('[data-count]', gate);
  const started = performance.now();
  const poster = $('.hero__poster');
  const ready = Promise.all([
    document.fonts.ready,
    poster.complete ? Promise.resolve() : new Promise((r) => { poster.onload = poster.onerror = r; }),
    new Promise((r) => setTimeout(r, 1700)), // let the mark finish drawing
  ]);
  let shown = 0, done = false;
  ready.then(() => { done = true; });
  const countLoop = () => {
    const target = done ? 100 : Math.min(92, ((performance.now() - started) / 1700) * 92);
    shown = lerp(shown, target, done ? 0.25 : 0.12);
    count.textContent = String(Math.round(shown)).padStart(3, '0');
    if (done && shown > 99.4) {
      count.textContent = '100';
      enterBtns.forEach((b) => (b.disabled = false));
      enterBtns[0].focus({ preventScroll: true });
      return;
    }
    requestAnimationFrame(countLoop);
  };
  countLoop();
  player.warm(0);
  enterBtns.forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.enter === 'sound') player.play(0);
      gate.classList.add('is-entering');
      setTimeout(reveal, 900);
    }),
  );
}

function numberWord(n) {
  const w = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
    'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
  return w[n] || String(n);
}
