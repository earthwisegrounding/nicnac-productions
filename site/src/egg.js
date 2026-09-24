// ◬ 1 / 1
import './egg.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GOLD = 0xd4a64a;

export function reveal({ art, model, onClose } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'egg';
  dlg.setAttribute('aria-label', 'One of one');
  dlg.innerHTML = `
    <canvas class="egg__gl" aria-hidden="true"></canvas>
    <canvas class="egg__confetti" aria-hidden="true"></canvas>
    <div class="egg__cardstage">
      <div class="egg__card">
        <div class="egg__spin">
          <div class="egg__face egg__face--back" aria-hidden="true">
            <svg viewBox="0 0 120 108" class="mark"><use href="#mark" /></svg>
            <span class="mono">NicNac Productions</span>
          </div>
          <div class="egg__face egg__face--front">
            <header class="egg__top mono"><span>◬ NicNac Productions</span><span>1 / 1</span></header>
            <figure class="egg__art">
              <img src="${art}" width="768" height="1365"
                   alt="NicNac on stage with two kids holding mics, a packed crowd, lasers and pyro, and “Nic Nac Productions” on the screens." />
              <span class="egg__holo" aria-hidden="true"></span>
              <span class="egg__glare" aria-hidden="true"></span>
            </figure>
            <footer class="egg__meta mono"><span>Legendary</span><span>◆ ◆ ◆</span><span>No. 001 / 001</span></footer>
          </div>
        </div>
      </div>
    </div>
    <div class="egg__ui">
      <p class="egg__kicker mono">◬ You found the one-of-one</p>
      <div class="egg__copy">
        <h2 class="egg__name">The Reason</h2>
        <p class="egg__quote">“…do something you love to help take care of the ones you love.”</p>
        <p class="egg__line"><em>What the eye sees, the record keeps.</em></p>
      </div>
      <div class="egg__actions">
        <button class="egg__btn mono" type="button" data-egg="toggle">The photo</button>
        <span class="egg__hint mono">Drag to spin</span>
      </div>
      <button class="egg__close mono" type="button" data-egg="close">Close ✕</button>
    </div>
    <div class="egg__flash" aria-hidden="true"></div>`;
  document.body.append(dlg);
  dlg.showModal();

  let stopped = false;
  let stage = null;
  const close = () => {
    if (stopped) return;
    stopped = true;
    dlg.classList.add('is-out');
    setTimeout(() => { stage?.dispose(); dlg.close(); dlg.remove(); onClose?.(); }, 450);
  };
  const $ = (s) => dlg.querySelector(s);
  $('[data-egg="close"]').addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  const toggle = $('[data-egg="toggle"]');
  const setCard = (on) => {
    dlg.classList.toggle('is-card', on);
    toggle.textContent = on ? 'The figure' : 'The photo';
    $('.egg__hint').textContent = on ? 'Tilt it' : 'Drag to spin';
    if (on) { const s = $('.egg__spin'); s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; }
  };
  toggle.addEventListener('click', () => setCard(!dlg.classList.contains('is-card')));
  $('.egg__cardstage').addEventListener('click', (e) => { if (e.target.classList.contains('egg__cardstage')) setCard(false); });

  // holo card tilt (only matters while the card is showing)
  const card = $('.egg__card');
  const t = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0 };
  dlg.addEventListener('pointermove', (e) => { t.tx = e.clientX / innerWidth; t.ty = e.clientY / innerHeight; t.active = performance.now(); });
  const tilt = (now) => {
    if (stopped) return;
    requestAnimationFrame(tilt);
    if (!dlg.classList.contains('is-card')) return;
    if (now - t.active > 2500) { const s = now / 1000; t.tx = 0.5 + Math.sin(s * 0.9) * 0.22; t.ty = 0.5 + Math.cos(s * 0.7) * 0.16; }
    t.x += (t.tx - t.x) * 0.08; t.y += (t.ty - t.y) * 0.08;
    card.style.setProperty('--rx', `${(0.5 - t.y) * 18}deg`);
    card.style.setProperty('--ry', `${(t.x - 0.5) * 24}deg`);
    card.style.setProperty('--mx', `${(t.x * 100).toFixed(2)}%`);
    card.style.setProperty('--my', `${(t.y * 100).toFixed(2)}%`);
  };
  if (!reduced) requestAnimationFrame(tilt);

  // the figure: real-time 3D. If anything about it fails, the card is the reveal.
  try {
    stage = createStage($('.egg__gl'), { model, isStopped: () => stopped });
    stage.ready.then(() => dlg.classList.add('is-live')).catch((err) => {
      console.warn(err);
      toggle.hidden = true;
      setCard(true);
    });
  } catch (err) {
    console.warn(err);
    toggle.hidden = true;
    setCard(true);
  }

  if (!reduced) setTimeout(() => !stopped && confetti($('.egg__confetti'), () => stopped), 1150);
  $('[data-egg="close"]').focus({ preventScroll: true });
  return close;
}

// ------------------------------------------------------------------ the 3D stage
function createStage(canvas, { model, isStopped }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = THREE.MathUtils.degToRad(55);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(96);
  controls.rotateSpeed = 0.7;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.9;
  let idleTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener('end', () => { idleTimer = setTimeout(() => (controls.autoRotate = !reduced), 3500); });

  // lights: warm key, cobalt rims, a little fill
  scene.add(new THREE.HemisphereLight(0x9fb2ff, 0x1a1208, 0.55));
  const key = new THREE.DirectionalLight(0xffe2c4, 2.4); key.position.set(-2.2, 3.2, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(2.5, 1.2, 3); scene.add(fill);
  for (const x of [-1.9, 1.9]) {
    const rim = new THREE.PointLight(0x4a6dff, 26, 9, 2); rim.position.set(x, 2.3, -1.6); scene.add(rim);
  }
  const top = new THREE.SpotLight(0xfff1d6, 30, 10, 0.5, 0.6, 2); top.position.set(0, 5, 1.2); top.target.position.set(0, 0.5, 0); scene.add(top, top.target);

  const world = new THREE.Group();
  scene.add(world);

  // podium: the pyramid's base, flat edge to the front, black top inlay
  const R = 1.8, H = 0.26;
  const tri = (r) => {
    const s = new THREE.Shape();
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / 3; // apex points away from camera once rotated
      const p = [Math.cos(a) * r, Math.sin(a) * r];
      i ? s.lineTo(...p) : s.moveTo(...p);
    }
    s.closePath();
    return s;
  };
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.24, envMapIntensity: 1.6 });
  const podGeo = new THREE.ExtrudeGeometry(tri(R), { depth: H, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 4, steps: 1 });
  podGeo.rotateX(-Math.PI / 2);           // shape plane -> floor, extrude upward; apex points away, flat edge faces camera
  const podium = new THREE.Mesh(podGeo, gold);
  const inlay = new THREE.Mesh(
    new THREE.ShapeGeometry(tri(R * 0.86)).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x050507, metalness: 0.4, roughness: 0.25 }),
  );
  inlay.position.y = H + 0.028;
  const podGroup = new THREE.Group();
  podGroup.add(podium, inlay);
  podGroup.position.z = 0.25;
  world.add(podGroup);

  // soft shadow on the floor
  const shadowTex = radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)');
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002;
  world.add(shadow);

  // behind them: a slow gold triangle frame and the eclipse glow, like the hero
  const frameShape = tri(2.1);
  frameShape.holes.push(tri(1.84));
  const frame = new THREE.Mesh(
    new THREE.ExtrudeGeometry(frameShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 }),
    gold,
  );
  frame.position.set(0, 1.3, -1.9);
  world.add(frame);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(70,105,255,0.55)', 'rgba(20,30,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(0, 1.45, -2.05);
  world.add(glow);

  // lasers, like the night in the photo
  const lasers = new THREE.Group();
  const cols = [0xff2d55, 0x36e0a0, 0x3563ff, 0xff3d9a, 0x5dff7a, 0x4a8bff];
  cols.forEach((c, i) => {
    const mat = (o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 14, 6, 1, true).translate(0, 7, 0), mat(0.9));
    beam.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 14, 8, 1, true).translate(0, 7, 0), mat(0.14)));
    beam.userData = { phase: i * 1.7, side: i % 2 ? 1 : -1 };
    lasers.add(beam);
  });
  lasers.position.set(0, 0.2, -3.2);
  world.add(lasers);

  // the three of them
  const figure = new THREE.Group();
  figure.position.set(0, H + 0.03, 0.32);   // forward, so the row fits inside the triangle
  world.add(figure);
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader(); // three bundles the decoder; Vite fingerprints it
  loader.setDRACOLoader(dracoLoader);
  const ready = loader.loadAsync(model).then((gltf) => {
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.material.envMapIntensity = 0.35;
        if (o.material.map) o.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      }
    });
    figure.add(gltf.scene);
    tFig = performance.now();
  });

  // layout: keep them framed on any screen
  const target = new THREE.Vector3(0, 1.12, 0);
  const tStart = performance.now();
  let tFig = 0;   // the figure's entrance starts once it has actually loaded
  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // distance so ~2.6 units of height fit vertically and ~2.2 horizontally
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const wide = w > 820;
    const dH = (wide ? 1.62 : 1.5) / Math.tan(vfov / 2);
    const dW = 1.3 / (Math.tan(vfov / 2) * camera.aspect);
    camera.userData.dist = Math.max(dH, dW);
    // shift the projection (not the orbit) so the figure sits right of the copy on wide screens
    if (wide) camera.setViewOffset(w, h, -w * 0.14, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  fit();
  camera.position.set(0, 1.35, camera.userData.dist * 1.9);
  controls.target.copy(target);
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);

  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const back = (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  let raf;
  const loop = () => {
    if (isStopped()) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const time = (now - tStart) / 1000;
    const k = reduced ? 1 : Math.min(1, (now - tStart) / 1700);
    const fk = !tFig ? 0 : reduced ? 1 : Math.min(1, (now - tFig) / 1450);

    // entrance: podium rises, the figure spins up out of it, camera dollies in
    podGroup.position.y = (1 - ease(Math.min(1, k * 1.4))) * -0.6;
    figure.scale.setScalar(Math.max(0.001, back(fk)));
    figure.rotation.y = (1 - ease(fk)) * -Math.PI * 2;
    if (k < 1) {
      const d = camera.userData.dist * (1 + (1 - ease(k)) * 0.9);
      const dir = camera.position.clone().sub(target).normalize();
      camera.position.copy(target).addScaledVector(dir, d);
    }
    frame.rotation.z = time * 0.12;
    glow.material.opacity = 0.85 + Math.sin(time * 1.3) * 0.15;
    lasers.children.forEach((b, i) => {
      const p = b.userData.phase;
      b.rotation.z = b.userData.side * (0.25 + 0.35 * Math.sin(time * 0.6 + p));
      b.rotation.x = -0.35 + 0.2 * Math.sin(time * 0.45 + p * 1.3);
      const o = (0.45 + 0.35 * Math.sin(time * 2.1 + p)) * Math.min(1, k * 2);
      b.material.opacity = o;
      b.children[0].material.opacity = o * 0.18;
    });
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  return {
    ready,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      dracoLoader.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
      envTex.dispose(); pmrem.dispose();
      renderer.dispose();
    },
  };
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------ confetti (stage cannons)
function confetti(canvas, isStopped) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = innerWidth, H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const cols = ['#d4a64a', '#f5dc97', '#3563ff', '#86a0ff', '#ece6da', '#ff3d7f', '#36e0a0', '#ffb020'];
  const P = [];
  const g = 0.28;
  const burst = (x, y, n, angle, spread, speed) => {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread, v = speed * (0.55 + Math.random() * 0.6);
      P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35,
        w: 5 + Math.random() * 7, h: 3 + Math.random() * 5, c: cols[i % cols.length], life: 0, wob: Math.random() * 6.28 });
    }
  };
  const up = Math.sqrt(2 * g * H * 0.9);
  burst(0, H, 140, -Math.PI / 2 + 0.5, 0.6, up);
  burst(W, H, 140, -Math.PI / 2 - 0.5, 0.6, up);
  burst(W / 2, H * 0.42, 80, 0, Math.PI * 2, 12);
  let last = performance.now();
  const step = (now) => {
    if (isStopped()) return;
    const dt = Math.min((now - last) / 16.67, 3);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of P) {
      p.life += dt;
      if (p.y > H + 40 || p.life > 420) continue;
      alive++;
      p.vx *= Math.pow(0.986, dt);
      p.vy = p.vy * Math.pow(0.986, dt) + g * dt;
      p.x += p.vx * dt + Math.sin(p.wob + p.life * 0.1) * 0.5;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.scale(1, Math.cos(p.life * 0.15 + p.wob));
      ctx.globalAlpha = Math.min(1, Math.max(0, (420 - p.life) / 80));
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
