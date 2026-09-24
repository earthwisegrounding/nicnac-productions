// Custom player on top of SoundCloud's official embed widget.
// One hidden widget iframe does the streaming; everything the visitor sees is ours.
// Docs: https://developers.soundcloud.com/docs/api/html5-widget

const API = 'https://w.soundcloud.com/player/api.js';
const WIDGET_OPTS = {
  buying: false, sharing: false, download: false, show_artwork: false, show_comments: false,
  show_playcount: false, show_user: false, hide_related: true, visual: false, show_teaser: false,
  single_active: false, color: '#d4a64a',
};
const qs = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const trackUrl = (id) => `https://api.soundcloud.com/tracks/${id}`;

export const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

let apiPromise;
const loadApi = () =>
  (apiPromise ||= new Promise((res, rej) => {
    if (window.SC?.Widget) return res(window.SC);
    const s = document.createElement('script');
    s.src = API; s.async = true;
    s.onload = () => res(window.SC);
    s.onerror = () => rej(new Error('SoundCloud widget API failed to load'));
    document.head.append(s);
  }));

export class Player extends EventTarget {
  constructor(tracks, root) {
    super();
    this.tracks = tracks;
    this.root = root;
    this.index = -1;
    this.loadedIndex = -1;
    this.playing = false;
    this.pos = 0;            // ms, last reported by the widget
    this.posAt = 0;          // performance.now() of that report
    this.dur = 0;
    this.volume = 85;
    this.muted = false;
    this.ready = false;
    this.pending = null;     // action queued until the widget is ready
    this.envs = tracks.map((t) => decodeEnv(t.env));
    this.el = Object.fromEntries([...root.querySelectorAll('[data-p]')].map((n) => [n.dataset.p, n]));
    this.wave = new Wave(this.el.wave, this);
    this.#bindUi();
  }

  /** Create the widget early (e.g. behind the gate) so the first play is instant. */
  async warm(i = 0) {
    if (this.widget || this.warming) return this.warming;
    this.warming = (async () => {
      const SC = await loadApi();
      const t = this.tracks[i];
      const iframe = document.createElement('iframe');
      iframe.title = 'SoundCloud player';
      iframe.allow = 'autoplay; encrypted-media';
      iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl(t.id))}&auto_play=false&${qs(WIDGET_OPTS)}`;
      this.el.frame.append(iframe);
      this.widget = SC.Widget(iframe);
      this.loadedIndex = i;
      const E = SC.Widget.Events;
      this.widget.bind(E.READY, () => {
        this.ready = true;
        this.widget.setVolume(this.muted ? 0 : this.volume);
        const p = this.pending; this.pending = null;
        p?.();
      });
      this.widget.bind(E.PLAY, () => {
        this.playing = true; this.posAt = performance.now();
        clearTimeout(this.watchdog);
        this.#unlock(false);
        this.#state('playing');
        this.widget.getDuration((d) => { if (d) this.dur = d; });
      });
      this.widget.bind(E.PAUSE, () => { this.#syncPos(); this.playing = false; this.#state('paused'); });
      this.widget.bind(E.FINISH, () => { this.playing = false; this.next(true); });
      this.widget.bind(E.PLAY_PROGRESS, (e) => {
        this.pos = e.currentPosition; this.posAt = performance.now();
        if (e.currentPosition > 0 && this.root.classList.contains('is-unlock')) { clearTimeout(this.watchdog); this.#unlock(false); }
        if (!this.playing && e.currentPosition > 0) { this.playing = true; this.#state('playing'); }
      });
      this.widget.bind(E.SEEK, (e) => { this.pos = e.currentPosition; this.posAt = performance.now(); });
      this.widget.bind(E.ERROR, () => {
        this.#status(`Couldn’t stream “${this.current?.title}”. Skipping.`);
        setTimeout(() => this.next(true), 900);
      });
    })();
    return this.warming;
  }

  get current() { return this.tracks[this.index]; }

  /** Interpolated playhead in ms. */
  position() {
    if (!this.playing) return this.pos;
    return Math.min(this.pos + (performance.now() - this.posAt), this.dur || Infinity);
  }

  /** 0..1 loudness from the track's waveform at the playhead (drives the visuals). */
  energy() {
    if (this.index < 0 || !this.playing) return 0;
    const env = this.envs[this.index];
    if (!env.length || !this.dur) return 0;
    const x = (this.position() / this.dur) * (env.length - 1);
    const i = Math.floor(x), f = x - i;
    return (env[i] ?? 0) * (1 - f) + (env[i + 1] ?? env[i] ?? 0) * f;
  }

  async play(i = this.index < 0 ? 0 : this.index) {
    i = (i + this.tracks.length) % this.tracks.length;
    await this.warm(i);
    const same = i === this.index;
    this.index = i;
    this.dur = this.tracks[i].duration;
    this.#announce();
    const go = () => {
      if (i !== this.loadedIndex) {
        this.loadedIndex = i;
        this.pos = 0; this.posAt = performance.now();
        this.widget.load(trackUrl(this.tracks[i].id), {
          ...WIDGET_OPTS, auto_play: true,
          callback: () => { this.widget.setVolume(this.muted ? 0 : this.volume); this.widget.play(); },
        });
      } else {
        this.widget.play();
      }
      this.#armWatchdog();
    };
    if (same && this.playing) return;
    this.#state('loading');
    this.ready ? go() : (this.pending = go);
  }

  pause() { this.widget?.pause(); }
  toggle() { this.playing ? this.pause() : this.play(); }
  next(auto = false) { this.play(this.index + 1); if (auto) this.dispatchEvent(new Event('auto-advance')); }
  prev() {
    if (this.position() > 4000) return this.seek(0);
    this.play(this.index - 1);
  }
  seek(ms) {
    if (!this.widget || this.index < 0) return;
    ms = Math.max(0, Math.min(ms, this.dur - 250));
    this.pos = ms; this.posAt = performance.now();
    this.widget.seekTo(ms);
  }
  setVolume(v) {
    this.volume = v; this.muted = v === 0;
    this.widget?.setVolume(v);
    this.el.mute.querySelector('use').setAttribute('href', v === 0 ? '#i-mute' : '#i-vol');
  }

  // ---------------------------------------------------------------- internals
  #syncPos() { this.pos = this.position(); this.posAt = performance.now(); }

  #state(s) {
    this.root.dataset.state = s;
    const icon = s === 'playing' || s === 'loading' ? '#i-pause' : '#i-play';
    this.el.toggle.querySelector('use').setAttribute('href', icon);
    this.el.toggle.setAttribute('aria-label', s === 'playing' ? 'Pause' : 'Play');
    document.documentElement.classList.toggle('is-playing', s === 'playing');
    this.dispatchEvent(new CustomEvent('state', { detail: { state: s, index: this.index } }));
  }

  #announce() {
    const t = this.current;
    this.el.title.textContent = t.title;
    this.el.year.textContent = `· ${t.year}`;
    const img = this.el.locate.querySelector('img');
    img.src = t.art; img.alt = `${t.title} artwork`;
    this.el.sclink.href = t.url;
    this.el.dur.textContent = fmt(t.duration);
    this.wave.setPeaks(t.peaks);
    this.dispatchEvent(new CustomEvent('track', { detail: { index: this.index, track: t } }));
  }

  // iOS Safari (and some privacy modes) refuse audio started from outside the iframe. If playback hasn't
  // begun shortly after a play(), surface SoundCloud's own player so one tap on it unlocks audio.
  #armWatchdog() {
    clearTimeout(this.watchdog);
    // only when the widget says it's *paused* (blocked), not while it's still buffering on a slow connection
    this.watchdog = setTimeout(() => {
      if (!this.playing) this.widget.isPaused((paused) => { if (paused && !this.playing) this.#unlock(true); });
    }, 4000);
  }
  #unlock(on) {
    this.root.classList.toggle('is-unlock', on);
    this.el.source.hidden = !on;
    if (on) this.#state('paused');
  }
  #status(msg) { this.dispatchEvent(new CustomEvent('status', { detail: msg })); }

  #bindUi() {
    const { el } = this;
    el.toggle.addEventListener('click', () => this.toggle());
    el.next.addEventListener('click', () => this.next());
    el.prev.addEventListener('click', () => this.prev());
    el.vol.addEventListener('input', () => this.setVolume(+el.vol.value));
    el.mute.addEventListener('click', () => {
      if (this.muted) { this.setVolume(this.lastVol || 85); el.vol.value = this.volume; }
      else { this.lastVol = this.volume; this.setVolume(0); el.vol.value = 0; }
    });
    el.locate.addEventListener('click', () => this.dispatchEvent(new Event('locate')));

    document.addEventListener('keydown', (e) => {
      if (this.index < 0 || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t.closest('input, textarea, select, [contenteditable], button, a, [role="slider"]')) return;
      if (e.code === 'Space') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'ArrowRight' && e.shiftKey) this.next();
      else if (e.key === 'ArrowLeft' && e.shiftKey) this.prev();
    });
  }
}

function decodeEnv(s = '') {
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = parseInt(s[i], 36) / 35;
  return out;
}

// -------------------------------------------------------------------- waveform scrubber
class Wave {
  constructor(el, player) {
    this.el = el;
    this.player = player;
    this.canvas = el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.peaks = [];
    this.hover = -1;
    new ResizeObserver(() => this.#size()).observe(el);
    this.#bind();
  }

  setPeaks(p) { this.peaks = p || []; this.draw(0); }

  #size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const { width, height } = this.el.getBoundingClientRect();
    this.w = width; this.h = height;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw(this.last ?? 0);
  }

  draw(progress) {
    this.last = progress;
    const { ctx, w, h, peaks } = this;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    if (h < 8) { // mobile: thin progress line
      ctx.fillStyle = 'rgba(236,230,218,.18)'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d4a64a'; ctx.fillRect(0, 0, w * progress, h);
      return;
    }
    const bar = 2, gap = 1.5, n = Math.max(1, Math.floor(w / (bar + gap)));
    const grad = ctx.createLinearGradient(0, 0, w * Math.max(progress, 0.001), 0);
    grad.addColorStop(0, '#8a6421'); grad.addColorStop(0.7, '#d4a64a'); grad.addColorStop(1, '#f5dc97');
    for (let i = 0; i < n; i++) {
      const a = Math.floor((i / n) * peaks.length), b = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
      let m = 0;
      for (let j = a; j < b; j++) m = Math.max(m, peaks[j] || 0);
      const bh = Math.max(2, (m / 100) * h * 0.92);
      const x = i * (bar + gap), y = (h - bh) / 2;
      const t = i / n;
      ctx.fillStyle = t <= progress ? grad : this.hover >= 0 && t <= this.hover ? 'rgba(236,230,218,.5)' : 'rgba(236,230,218,.2)';
      ctx.fillRect(x, y, bar, bh);
    }
    if (progress > 0) { ctx.fillStyle = '#86a0ff'; ctx.fillRect(Math.min(w * progress, w - 1.5), 0, 1.5, h); }
  }

  #bind() {
    const ratio = (e) => Math.min(1, Math.max(0, (e.clientX - this.el.getBoundingClientRect().left) / this.w));
    let dragging = false;
    this.el.addEventListener('pointerdown', (e) => {
      if (this.player.index < 0) return;
      dragging = true; this.el.setPointerCapture(e.pointerId);
      this.player.seek(ratio(e) * this.player.dur);
    });
    this.el.addEventListener('pointermove', (e) => {
      this.hover = ratio(e);
      if (dragging) this.player.seek(this.hover * this.player.dur);
    });
    this.el.addEventListener('pointerup', () => { dragging = false; });
    this.el.addEventListener('pointerleave', () => { this.hover = -1; });
    this.el.addEventListener('keydown', (e) => {
      const p = this.player;
      if (p.index < 0) return;
      const step = e.shiftKey ? 15000 : 5000;
      if (e.key === 'ArrowRight') p.seek(p.position() + step);
      else if (e.key === 'ArrowLeft') p.seek(p.position() - step);
      else if (e.key === 'Home') p.seek(0);
      else if (e.key === 'End') p.seek(p.dur - 1000);
      else return;
      e.preventDefault();
    });
  }
}
