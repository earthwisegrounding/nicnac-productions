// Hero renderer: the Blender loop as a live WebGL2 surface.
//  - the Cycles-rendered eyeball sprite nearest the visitor's gaze is composited into the video
//  - audio energy drives bloom, warp streaks, lens + chromatic aberration
//  - press & hold opens "the third eye": kaleidoscope, iridescence, time warp

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uVideo;
uniform sampler2D uEye0, uEye1, uEye2, uEye3;
uniform vec4 uEyeW;          // bilinear weights of the four gaze frames
uniform vec4 uEyeRect;       // sprite rect in video pixels, top-left origin
uniform float uEyeOn;
uniform vec2 uVideoSize;
uniform vec2 uRes;
uniform vec2 uMouse;         // -1..1, smoothed
uniform float uTime, uHold, uEnergy, uKick, uScroll, uPlay;

float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }

vec2 cover(vec2 uv) {
  float sa = uRes.x / uRes.y, va = uVideoSize.x / uVideoSize.y;
  vec2 s = sa > va ? vec2(1.0, va / sa) : vec2(sa / va, 1.0);
  return (uv - 0.5) * s + 0.5;
}

vec4 eyeTap(sampler2D t, vec2 e) { vec4 c = texture(t, e); return vec4(c.rgb * c.a, c.a); }

vec3 scene(vec2 vuv) {
  vec3 col = texture(uVideo, vuv).rgb;
  if (uEyeOn > 0.5) {
    vec2 px = vec2(vuv.x, 1.0 - vuv.y) * uVideoSize;
    vec2 e = (px - uEyeRect.xy) / uEyeRect.zw;
    if (e.x > 0.0 && e.x < 1.0 && e.y > 0.0 && e.y < 1.0) {
      vec2 et = vec2(e.x, 1.0 - e.y);
      vec4 s = eyeTap(uEye0, et) * uEyeW.x + eyeTap(uEye1, et) * uEyeW.y
             + eyeTap(uEye2, et) * uEyeW.z + eyeTap(uEye3, et) * uEyeW.w;
      s.rgb = pow(max(s.rgb, 0.0), vec3(1.22));   // a touch deeper in the pupil + limbal ring
      col = col * (1.0 - s.a) + s.rgb;
    }
  }
  return col;
}

void main() {
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);

  // exit: fall into the eye as the hero scrolls away; kick = a beat-ish punch
  float zoom = 1.0 + uScroll * uScroll * 2.2 + uKick * 0.045 + uHold * 0.08;
  p /= zoom;

  // third eye: six-fold mirrored kaleidoscope + breathing spiral
  float h = smoothstep(0.0, 1.0, uHold);
  if (h > 0.001) {
    float r = length(p);
    float a = atan(p.y, p.x) + uTime * 0.35 * h + r * 1.6 * h;
    float seg = 6.2831853 / 6.0;
    float ak = abs(mod(a, seg) - seg * 0.5);
    vec2 k = vec2(cos(ak), sin(ak)) * r;
    k *= 1.0 + 0.12 * sin(r * 14.0 - uTime * 4.0) * h;
    // the eye holds steady at the centre while the world fractures around it
    p = mix(p, k, h * smoothstep(0.11, 0.22, r));
  }

  // lens
  float r2 = dot(p, p);
  p *= 1.0 + (0.05 + uEnergy * 0.07 + uScroll * 0.35 + h * 0.2) * r2;
  p += uMouse * vec2(0.010, 0.007);

  vec2 suv = p / vec2(asp, 1.0) + 0.5;
  vec2 d = suv - 0.5;

  // chromatic aberration
  float ca = 0.0016 + uEnergy * 0.006 + uKick * 0.012 + h * 0.018 + uScroll * 0.03;
  vec3 col;
  col.r = scene(cover(suv + d * ca)).r;
  col.g = scene(cover(suv)).g;
  col.b = scene(cover(suv - d * ca)).b;

  vec2 vuv = cover(suv);

  // bloom from the video's mip chain
  vec3 b = textureLod(uVideo, vuv, 5.0).rgb * 0.55 + textureLod(uVideo, vuv, 3.0).rgb * 0.45;
  col += max(b - 0.32, 0.0) * (0.5 + uEnergy * 0.8 + h * 0.15);

  // warp streaks: march toward the eye, gathering bright gold
  vec2 toC = (vec2(0.5) - vuv) / 22.0 * (0.9 + uEnergy * 0.5);
  vec2 q = vuv; float fall = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < 22; i++) {
    q += toC;
    vec3 s = textureLod(uVideo, q, 2.5).rgb;
    float l = max(dot(s, vec3(0.3, 0.59, 0.11)) - 0.5, 0.0);
    acc += s * l * fall;
    fall *= 0.9;
  }
  col += acc * (0.04 + uEnergy * 0.16 + uKick * 0.16 + h * 0.06);

  // eclipse corona breathes with the music
  float ring = length((suv - 0.5) * vec2(asp, 1.0));
  col += vec3(0.20, 0.34, 1.0) * (uEnergy * 0.16 + h * 0.1) * exp(-ring * 7.0);

  // iridescent shift while tripping
  // thin-film iridescence on the metal only; blacks stay black
  if (h > 0.001) {
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (lum * 1.1 + ring * 1.8 - uTime * 0.22 + vec3(0.0, 0.33, 0.67)));
    vec3 trip = film * lum * 1.25;
    float metal = smoothstep(0.08, 0.35, lum);
    col = mix(col, trip, h * 0.7 * metal);
  }

  // grade
  float vig = smoothstep(1.25, 0.25, length(d * vec2(1.15, 1.0)));
  col *= mix(0.42, 1.0, vig);
  col = col / (1.0 + col * 0.12);
  col += (hash(uv * uRes + fract(uTime * 13.7) * 91.0) - 0.5) * 0.045;
  col *= 1.0 - uScroll * 0.65;

  outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export class Hero {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ eye: object, eyeBase: string, sources: {landscape: string[], portrait: string[]}, audio: () => number }} o
   */
  constructor(canvas, o) {
    this.canvas = canvas;
    this.o = o;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const n of ['uVideo', 'uEye0', 'uEye1', 'uEye2', 'uEye3', 'uEyeW', 'uEyeRect', 'uEyeOn', 'uVideoSize', 'uRes', 'uMouse',
      'uTime', 'uHold', 'uEnergy', 'uKick', 'uScroll', 'uPlay']) this.u[n] = gl.getUniformLocation(prog, n);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.texVideo = this.#tex(0, true);
    this.texEye = [1, 2, 3, 4].map((u) => this.#tex(u, false));
    gl.uniform1i(this.u.uVideo, 0);
    ['uEye0', 'uEye1', 'uEye2', 'uEye3'].forEach((n, i) => gl.uniform1i(this.u[n], i + 1));

    // state
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0, idle: 0 };
    this.hold = 0; this.holdTarget = 0;
    this.energy = 0; this.kick = 0; this.lastEnergy = 0;
    this.scroll = 0;
    this.visible = true;
    this.frames = new Map();       // "r_c" -> ImageBitmap
    this.eyeCells = [];            // currently bound cell keys per unit
    this.videoNew = false;
    this.t0 = performance.now();
    this.last = this.t0;

    this.#video();
    this.#resize();
    new ResizeObserver(() => this.#resize()).observe(canvas);
    this.#loadEye();
    this.loop = this.loop.bind(this);
    this.running = true;
    requestAnimationFrame(this.loop);
  }

  #tex(unit, mip) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([5, 5, 5, 255]));
    return t;
  }

  // ------------------------------------------------------------------ video
  #video() {
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.crossOrigin = 'anonymous';
    this.video = v;
    this.orient = null;
    this.#pickSource();
    const onFrame = () => { this.videoNew = true; v.requestVideoFrameCallback(onFrame); };
    if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(onFrame);
    v.addEventListener('playing', () => this.canvas.classList.add('is-live'), { once: true });
  }

  #pickSource() {
    const portrait = innerHeight > innerWidth * 1.05;
    const orient = portrait ? 'portrait' : 'landscape';
    if (orient === this.orient) return;
    this.orient = orient;
    const v = this.video;
    const list = this.o.sources[orient].filter((s) => !s.type || v.canPlayType(s.type));
    let k = 0;
    // walk down the list if a source fails (missing file, codec surprise)
    v.onerror = () => { if (++k < list.length) { v.src = list[k].src; v.play().catch(() => {}); } };
    v.src = list[0].src;
    this.videoSize = portrait ? [1080, 1920] : [1920, 1080];
    v.play().catch(() => {});
  }

  // ------------------------------------------------------------------ eye sprites
  async #loadEye() {
    const m = this.o.eye;
    if (!m) return;
    const [x, y, w, h] = m.rect;
    // the sprite was cut from the 1920x1080 frame; portrait shares the focal length, so shift to its centre
    this.eyeRect = { landscape: [x, y, w, h], portrait: [x - 960 + 540, y - 540 + 960, w, h] };
    const cols = m.cols, rows = m.rows;
    const cr = (rows - 1) / 2, cc = (cols - 1) / 2;
    // load centre-out so the neighbourhood of "looking at you" is ready first
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([r, c]);
    cells.sort((a, b) => Math.hypot(a[0] - cr, a[1] - cc) - Math.hypot(b[0] - cr, b[1] - cc));
    const name = (r, c) => m.file.replace('{r:02d}', String(r).padStart(2, '0')).replace('{c:02d}', String(c).padStart(2, '0'));
    const one = async ([r, c]) => {
      try {
        const res = await fetch(`${this.o.eyeBase}/${name(r, c)}`);
        const bmp = await createImageBitmap(await res.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
        this.frames.set(`${r}_${c}`, bmp);
      } catch {}
    };
    // small concurrency pool
    let i = 0;
    const worker = async () => { while (i < cells.length) await one(cells[i++]); };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  #bindEye() {
    const m = this.o.eye;
    if (!m || !this.frames.size) return 0;
    const cols = m.cols, rows = m.rows;
    const fc = ((this.gaze.x + 1) / 2) * (cols - 1);
    const fr = ((1 - this.gaze.y) / 2) * (rows - 1);     // gaze.y +1 = up = row 0
    const c0 = Math.floor(fc), r0 = Math.floor(fr);
    const c1 = Math.min(c0 + 1, cols - 1), r1 = Math.min(r0 + 1, rows - 1);
    // sharpened bilinear: mostly the nearest frame, quick crossfade between neighbours
    const sx = smooth(fc - c0), sy = smooth(fr - r0);
    const want = [[r0, c0], [r0, c1], [r1, c0], [r1, c1]];
    const wts = [(1 - sx) * (1 - sy), sx * (1 - sy), (1 - sx) * sy, sx * sy];
    const gl = this.gl;
    // fall back to the nearest loaded frame while the grid streams in
    const centre = `${(rows - 1) / 2}_${(cols - 1) / 2}`;
    for (let k = 0; k < 4; k++) {
      let key = `${want[k][0]}_${want[k][1]}`;
      if (!this.frames.has(key)) key = this.frames.has(centre) ? centre : this.frames.keys().next().value;
      if (this.eyeCells[k] !== key) {
        this.eyeCells[k] = key;
        gl.activeTexture(gl.TEXTURE1 + k);
        gl.bindTexture(gl.TEXTURE_2D, this.texEye[k]);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // bitmap already flipped
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.frames.get(key));
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      }
    }
    gl.uniform4f(this.u.uEyeW, ...wts);
    const rect = this.eyeRect[this.orient];
    gl.uniform4f(this.u.uEyeRect, ...rect);
    return 1;
  }

  // ------------------------------------------------------------------ input
  pointer(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.tx = ((clientX - r.left) / r.width) * 2 - 1;
    this.mouse.ty = ((clientY - r.top) / r.height) * 2 - 1;
    // the eye sits at the centre of the frame; aim the gaze at the pointer
    const gx = (clientX - (r.left + r.width / 2)) / (r.width * 0.42);
    const gy = -(clientY - (r.top + r.height / 2)) / (r.height * 0.42);
    this.gaze.tx = clamp(gx, -1, 1);
    this.gaze.ty = clamp(gy, -1, 1);
    this.gaze.idle = 0;
  }
  /** Aim at a point on screen (e.g. an element) for a moment. */
  lookAt(clientX, clientY) { this.pointer(clientX, clientY); }
  setHold(on) { this.holdTarget = on ? 1 : 0; }
  setScroll(p) { this.scroll = clamp(p, 0, 1); }
  setVisible(v) {
    this.visible = v;
    if (v) {
      this.video.play().catch(() => {});
      if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.loop); }
    } else this.video.pause();
  }

  #resize() {
    this.#pickSource();
    const dpr = Math.min(devicePixelRatio || 1, 1.5) * (this.quality ?? 1);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    const cap = 2.6e6, s = w * h > cap ? Math.sqrt(cap / (w * h)) : 1;
    this.canvas.width = Math.max(2, Math.round(w * s));
    this.canvas.height = Math.max(2, Math.round(h * s));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  // Adaptive resolution: weaker GPUs get fewer pixels instead of a stutter.
  #adapt(dt) {
    this.quality ??= 1;
    this.ft = this.ft ? this.ft * 0.95 + dt * 0.05 : dt;
    this.slow = this.ft > 0.021 ? (this.slow || 0) + dt : 0;
    this.fast = this.ft < 0.0135 ? (this.fast || 0) + dt : 0;
    if (this.slow > 1 && this.quality > 0.5) { this.quality = Math.max(0.5, this.quality * 0.82); this.slow = 0; this.#resize(); }
    else if (this.fast > 4 && this.quality < 1) { this.quality = Math.min(1, this.quality * 1.12); this.fast = 0; this.#resize(); }
  }

  // ------------------------------------------------------------------ frame
  loop(now) {
    if (!this.visible || document.hidden) { this.running = false; return; }
    requestAnimationFrame(this.loop);
    this.frame(now);
  }

  frame(now) {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.#adapt(dt);
    const gl = this.gl, u = this.u;

    // video -> texture (only when a new frame arrived)
    const v = this.video;
    if (v.readyState >= 2 && (this.videoNew || !('requestVideoFrameCallback' in v))) {
      this.videoNew = false;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texVideo);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    // idle gaze: small saccades around the room, the way a living eye does
    this.gaze.idle += dt;
    if (this.gaze.idle > 3.5) {
      if (!this.nextSaccade || now > this.nextSaccade) {
        this.gaze.tx = (Math.random() * 2 - 1) * 0.75;
        this.gaze.ty = (Math.random() * 2 - 1) * 0.55;
        if (Math.random() < 0.35) { this.gaze.tx = 0; this.gaze.ty = 0; } // look straight at the visitor
        this.nextSaccade = now + 900 + Math.random() * 2200;
      }
    }
    const gazeSpeed = this.gaze.idle > 3.5 ? 18 : 11;
    this.gaze.x = damp(this.gaze.x, this.gaze.tx, gazeSpeed, dt);
    this.gaze.y = damp(this.gaze.y, this.gaze.ty, gazeSpeed, dt);
    this.mouse.x = damp(this.mouse.x, this.mouse.tx, 3, dt);
    this.mouse.y = damp(this.mouse.y, this.mouse.ty, 3, dt);

    this.hold = damp(this.hold, this.holdTarget, this.holdTarget ? 2.2 : 4, dt);
    const e = this.o.audio?.() ?? 0;
    const rise = Math.max(0, e - this.lastEnergy);
    this.lastEnergy = e;
    this.kick = Math.max(this.kick * Math.exp(-dt * 7), Math.min(1, rise * 6));
    this.energy = damp(this.energy, e, 10, dt);

    // time: speed the tunnel up with the music and the trip
    const playing = this.o.playing?.() ? 1 : 0;
    const rate = 1 + playing * (0.2 + this.energy * 0.45) + this.hold * 2.2;
    if (Math.abs(v.playbackRate - rate) > 0.04) v.playbackRate = rate;

    const eyeOn = this.#bindEye();
    gl.uniform1f(u.uEyeOn, eyeOn);
    gl.uniform2f(u.uVideoSize, ...this.videoSize);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uMouse, this.mouse.x, -this.mouse.y);
    gl.uniform1f(u.uTime, (now - this.t0) / 1000);
    gl.uniform1f(u.uHold, this.hold);
    gl.uniform1f(u.uEnergy, this.energy);
    gl.uniform1f(u.uKick, this.kick);
    gl.uniform1f(u.uScroll, this.scroll);
    gl.uniform1f(u.uPlay, playing);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (t) => { const k = clamp((t - 0.22) / 0.56, 0, 1); return k * k * (3 - 2 * k); };
