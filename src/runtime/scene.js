// Browser runtime for one isometric story. Every frame is drawn from the timeline
// time alone, so Hyperframes can seek to any frame and get the same picture.
import * as THREE from './three.module.js';

{
  const S = window.__SCENE;
  const W = S.width;
  const H = S.height;
  const stage = document.getElementById('stage');

  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const noise = (t, rate, seed) => { const i = Math.floor(t * rate); const f = t * rate - i; const a = hash(i + seed * 101); const b = hash(i + 1 + seed * 101); return a + (b - a) * (f * f * (3 - 2 * f)); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = { 'linear': (k) => k, 'in': (k) => k * k, 'out': (k) => 1 - (1 - k) * (1 - k), 'in-out': (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) };
  const el = (tag, cls, parent) => { const node = document.createElement(tag); if (cls) node.className = cls; (parent || stage).appendChild(node); return node; };

  const world = el('div', 'world');
  const glCanvas = el('canvas', 'gl');
  const fx = el('canvas', 'fx');
  fx.width = W; fx.height = H;
  const ctx = fx.getContext('2d');
  const tint = el('div', 'tint');
  const lightsOut = el('div', 'lights-out');
  const caption = el('div', 'caption');
  const title = el('div', 'title');
  S.title.lines.forEach((line) => { const row = el('div', line.accent ? 'title-line accent' : 'title-line', title); row.textContent = line.text; });
  const banner = el('div', 'banner');
  banner.innerHTML = '<span class="banner-label">&#9888; ' + escapeHtml(S.broadcast.label) + '</span><span class="banner-live">&#9679; LIVE</span>';
  const terminal = el('div', 'terminal');
  const rule = el('div', 'rule');
  const ruleNumber = el('div', 'rule-number', rule);
  const ruleText = el('div', 'rule-text', rule);
  const flash = el('div', 'flash');
  const black = el('div', 'black');

  function escapeHtml(text) { return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // Clay rigs (Three.js) ---------------------------------------------------
  const PALETTE = {
    hero: { coat: 0xf0a92a, skin: 0xf2c9a0, pants: 0x2c3446, shoes: 0x1c1c1c, hood: true, eye: 0x161616 },
    zombie: { coat: 0x45607a, skin: 0x8fae6a, pants: 0x3a3226, shoes: 0x241d16, hood: false, eye: 0xf0ffd0 },
    double: { coat: 0x8a6c22, skin: 0xb39a80, pants: 0x1c2130, shoes: 0x111111, hood: true, eye: 0xff2020 },
  };
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene3d = new THREE.Scene();
  const camera3d = new THREE.OrthographicCamera(0, W, 0, -H, -5000, 5000);
  camera3d.position.z = 1000;
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x2a2018, 1.1);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-0.6, 1, 0.9);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.9);
  rim.position.set(0.8, 0.6, -0.6);
  scene3d.add(hemi, key, rim);
  const LIGHTS = {
    'dusk': { sky: 0xffd6a8, ground: 0x3a2418, hemi: 1.15, key: 0xffc58a, keyI: 2.4, rim: 0xff9a6a },
    'twilight': { sky: 0x9fd6d2, ground: 0x1a2a24, hemi: 1.0, key: 0xcfe8ff, keyI: 1.8, rim: 0x7fd0c0 },
    'night': { sky: 0x8fb0ff, ground: 0x10181a, hemi: 0.85, key: 0xaac4ff, keyI: 1.6, rim: 0x6fe0a0 },
    'interior-night': { sky: 0x9fb0e0, ground: 0x2a1a10, hemi: 0.95, key: 0xffd29a, keyI: 2.0, rim: 0x7090ff },
    'blackout': { sky: 0x5a70a8, ground: 0x08080c, hemi: 0.55, key: 0x9fb8ff, keyI: 0.9, rim: 0x4a70ff },
  };
  const clay = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.0 });
  function limb(radius, length, material) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), material);
    mesh.position.y = -(length / 2 + radius);
    pivot.add(mesh);
    return pivot;
  }

  // Unit rig: 1.0 tall, feet at y = 0, facing +z.
  function buildRig(actor) {
    const c = PALETTE[actor.rig];
    const root = new THREE.Group();
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.26, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    root.add(shadow);
    const body = new THREE.Group();
    root.add(body);
    const pants = clay(c.pants), coat = clay(c.coat), skin = clay(c.skin), shoes = clay(c.shoes);
    const legL = limb(0.055, 0.26, pants); legL.position.set(-0.07, 0.4, 0);
    const legR = limb(0.055, 0.26, pants); legR.position.set(0.07, 0.4, 0);
    for (const leg of [legL, legR]) { const foot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), shoes); foot.scale.set(1, 0.6, 1.5); foot.position.set(0, -0.37, 0.03); leg.add(foot); }
    body.add(legL, legR);
    const torso = new THREE.Group(); torso.position.y = 0.4; body.add(torso);
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.2, 8, 16), coat);
    trunk.position.y = 0.17; trunk.scale.set(1, 1, 0.78); torso.add(trunk);
    if (actor.rig === 'zombie') { const rag = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.08, 9, 1, true), clay(0x2b3d4f)); rag.position.y = 0.03; rag.scale.z = 0.8; torso.add(rag); }
    const armL = limb(0.045, 0.24, coat); armL.position.set(-0.19, 0.33, 0);
    const armR = limb(0.045, 0.24, coat); armR.position.set(0.19, 0.33, 0);
    for (const arm of [armL, armR]) { const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), skin); hand.position.y = -0.35; arm.add(hand); }
    if (actor.carrying === 'grocery-bag') { const bag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.1), clay(0xb08350)); bag.position.set(0, -0.42, 0.02); armR.add(bag); const greens = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), clay(0x7aa84a)); greens.position.set(0, -0.32, 0.02); armR.add(greens); }
    torso.add(armL, armR);
    const head = new THREE.Group(); head.position.y = 0.4; torso.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), skin); skull.position.y = 0.12; head.add(skull);
    if (c.hood) { const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), coat); hood.position.set(0, 0.13, -0.015); hood.rotation.x = -0.35; head.add(hood); }
    const eyeMat = new THREE.MeshBasicMaterial({ color: c.eye });
    for (const x of [-0.045, 0.045]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), eyeMat); eye.position.set(x, 0.13, 0.118); head.add(eye); }
    if (actor.rig === 'zombie') { const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.02), clay(0x3b2a1a)); jaw.position.set(0, 0.06, 0.118); head.add(jaw); }
    root.visible = false;
    scene3d.add(root);
    return { root, body, torso, head, legL, legR, armL, armR };
  }

  const deg = (d) => (d * Math.PI) / 180;
  function pose(rig, gait, t, knocks) {
    let legSwing = 0, armSwing = 0, armRaise = 0, lean = 0, bob = 0, headTilt = 0, breathe = 1, knockArm = 0;
    if (gait === 'walk') { const p = Math.sin(t * Math.PI * 2 * 1.7); legSwing = 26 * p; armSwing = -22 * p; bob = Math.abs(p) * 0.018; lean = 4; }
    else if (gait === 'run') { const p = Math.sin(t * Math.PI * 2 * 2.9); legSwing = 46 * p; armSwing = -48 * p; bob = Math.abs(p) * 0.04; lean = 14; }
    else if (gait === 'shamble') { const p = Math.sin(t * Math.PI * 2 * 1.05); legSwing = 16 * p; armRaise = -80 + 6 * Math.sin(t * 5.1); lean = 10 + 3 * p; bob = Math.abs(p) * 0.015; headTilt = 16 + 6 * Math.sin(t * 1.7); }
    else if (gait === 'lunge') { const p = Math.sin(t * Math.PI * 2 * 2.2); legSwing = 32 * p; armRaise = -88 + 8 * p; lean = 18; bob = Math.abs(p) * 0.03; headTilt = 10; }
    else if (gait === 'knock') {
      breathe = 1 + 0.012 * Math.sin(t * 2.4); lean = 4;
      for (const beat of knocks) {
        if (t >= beat - 0.25 && t < beat + 0.75) knockArm = -95;
        for (const rap of [0, 0.2, 0.4]) { const d = t - (beat + rap); if (d >= -0.08 && d < 0.14) knockArm = -95 - 25 * Math.sin(clamp((d + 0.08) / 0.22, 0, 1) * Math.PI); }
      }
    } else { breathe = 1 + 0.015 * Math.sin(t * 2.2); }
    rig.legL.rotation.x = deg(legSwing);
    rig.legR.rotation.x = deg(-legSwing);
    rig.armL.rotation.x = deg(-armSwing + armRaise);
    rig.armR.rotation.x = deg(armSwing + (knockArm || armRaise));
    rig.head.rotation.z = deg(headTilt * 0.4);
    rig.head.rotation.x = deg(headTilt * 0.6);
    rig.torso.rotation.x = deg(lean);
    rig.body.position.y = bob;
    rig.torso.scale.y = breathe;
  }

  function pathAt(path, k) {
    if (k <= path[0].at) return path[0];
    for (let i = 1; i < path.length; i++) {
      if (k <= path[i].at) { const a = path[i - 1], b = path[i]; const f = (k - a.at) / Math.max(1e-6, b.at - a.at); return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) }; }
    }
    return path[path.length - 1];
  }

  function buildShadows(parent, spec, plate) {
    const box = el('div', 'window-shadows', parent);
    box.style.left = spec.region.x * plate.width + 'px';
    box.style.top = spec.region.y * plate.height + 'px';
    box.style.width = spec.region.w * plate.width + 'px';
    box.style.height = spec.region.h * plate.height + 'px';
    const figures = [];
    for (let i = 0; i < spec.count; i++) { const f = el('div', 'shadow-figure', box); figures.push(f); }
    return { box, figures };
  }

  // Plate and actor world: one wrapper per shot, moved by the camera.
  const shotViews = S.shots.map((shot) => {
    const plate = S.plates[shot.plate_id];
    const wrap = el('div', 'shot', world);
    wrap.style.width = plate.width + 'px';
    wrap.style.height = plate.height + 'px';
    const img = el('img', 'plate', wrap);
    img.src = plate.src;
    img.width = plate.width;
    img.height = plate.height;
    const shadows = shot.windowShadows ? buildShadows(wrap, shot.windowShadows, plate) : null;
    const actors = shot.actors.map((actor) => ({ actor, rig: buildRig(actor) }));
    return { shot, plate, wrap, actors, shadows };
  });

  // Frame -------------------------------------------------------------------
  function shotAt(t) { for (const view of shotViews) if (t < view.shot.end) return view; return shotViews[shotViews.length - 1]; }
  function segmentAt(t) { return S.segments.find((s) => t >= s.start - 0.05 && t < s.end + 0.25); }

  function drawAtmosphere(t, view, local) {
    const a = view.shot.atmosphere;
    ctx.clearRect(0, 0, W, H);
    const fogColor = { dusk: '255,190,140', twilight: '120,190,180', night: '110,170,140', 'interior-night': '120,140,190', blackout: '60,80,120' }[view.shot.grade];
    if (a.fog > 0) {
      for (let i = 0; i < 4; i++) {
        const x = ((t * (14 + i * 6) + i * 340) % (W + 900)) - 450;
        const y = H * (0.62 + i * 0.09);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 620);
        g.addColorStop(0, 'rgba(' + fogColor + ',' + (0.22 * a.fog) + ')');
        g.addColorStop(1, 'rgba(' + fogColor + ',0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      const floor = ctx.createLinearGradient(0, H * 0.55, 0, H);
      floor.addColorStop(0, 'rgba(' + fogColor + ',0)');
      floor.addColorStop(1, 'rgba(' + fogColor + ',' + (0.3 * a.fog) + ')');
      ctx.fillStyle = floor; ctx.fillRect(0, 0, W, H);
    }
    if (a.particles !== 'none') {
      const ash = a.particles === 'ash';
      for (let i = 0; i < 70; i++) {
        const sx = hash(i * 3.1) * W, sy = hash(i * 7.7) * H;
        const speed = ash ? 40 + hash(i) * 60 : 6 + hash(i) * 10;
        const x = (sx + Math.sin(t * 0.7 + i) * 30 + (ash ? t * 18 : t * 5)) % W;
        const y = ash ? (sy + t * speed) % H : (sy - t * speed + H * 4) % H;
        const r = ash ? 2 + hash(i * 1.3) * 3 : 1 + hash(i * 2.1) * 2.2;
        ctx.fillStyle = ash ? 'rgba(200,200,200,' + (0.35 + 0.3 * hash(i)) + ')' : 'rgba(255,220,170,' + (0.25 + 0.35 * noise(t, 2, i)) + ')';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    const beat = (k) => Math.exp(-Math.pow((k % 0.85) / 0.06, 2)) + 0.6 * Math.exp(-Math.pow(((k - 0.22) % 0.85) / 0.06, 2));
    const pulse = a.heartbeat_pulse * beat(Math.max(0, local));
    const vig = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,' + clamp(0.55 + 0.3 * pulse, 0, 0.95) + ')');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
    if (pulse > 0.01) { ctx.fillStyle = 'rgba(120,0,0,' + 0.12 * pulse + ')'; ctx.fillRect(0, 0, W, H); }
    if (a.flicker > 0) {
      const dip = noise(t, 9, 7) > 0.82 ? 0.55 : noise(t, 3, 3) * 0.25;
      ctx.fillStyle = 'rgba(0,0,0,' + clamp(a.flicker * dip, 0, 0.6) + ')'; ctx.fillRect(0, 0, W, H);
    }
  }

  function render(t) {
    const view = shotAt(t);
    const shot = view.shot;
    const span = shot.end - shot.start;
    const local = t - shot.start;
    const k = clamp(local / span, 0, 1);
    const cam = shot.camera;
    const e = ease[cam.ease](k);
    const zoom = lerp(cam.from.zoom, cam.to.zoom, e);
    const cx = lerp(cam.from.x, cam.to.x, e);
    const cy = lerp(cam.from.y, cam.to.y, e);
    const base = Math.max(W / view.plate.width, H / view.plate.height);
    const scale = base * zoom;
    let dx = Math.sin(t * 0.55) * cam.drift * 14, dy = Math.cos(t * 0.43) * cam.drift * 10;
    for (const s of shot.shakes) {
      const d = local - s.at * span;
      if (d >= 0 && d < s.duration_seconds) { const decay = 1 - d / s.duration_seconds; dx += (noise(t, 30, 1) - 0.5) * 70 * s.strength * decay; dy += (noise(t, 30, 2) - 0.5) * 70 * s.strength * decay; }
    }
    let glitch = 0;
    if (shot.transition_in === 'glitch' && local < 0.3) glitch = 1 - local / 0.3;
    if (glitch > 0) dx += (noise(t, 60, 5) - 0.5) * 90 * glitch;
    for (const other of shotViews) other.wrap.style.display = other === view ? 'block' : 'none';
    view.wrap.style.transform = 'translate(' + (W / 2 - cx * view.plate.width * scale + dx) + 'px,' + (H / 2 - cy * view.plate.height * scale + dy) + 'px) scale(' + scale + ')';
    view.wrap.style.filter = S.grades[shot.grade] + (glitch > 0 ? ' hue-rotate(' + Math.round(glitch * 70) + 'deg) saturate(' + (1 + glitch) + ')' : '');
    tint.style.background = S.tints[shot.grade];

    const originX = W / 2 - cx * view.plate.width * scale + dx;
    const originY = H / 2 - cy * view.plate.height * scale + dy;
    const light = LIGHTS[shot.grade];
    hemi.color.setHex(light.sky); hemi.groundColor.setHex(light.ground); hemi.intensity = light.hemi;
    key.color.setHex(light.key); key.intensity = light.keyI; rim.color.setHex(light.rim);
    for (const other of shotViews) if (other !== view) for (const { rig } of other.actors) rig.root.visible = false;
    for (const { actor, rig } of view.actors) {
      const visible = actor.enter_at === undefined || k >= actor.enter_at;
      rig.root.visible = visible;
      if (!visible) continue;
      const p = pathAt(actor.path, k);
      const ahead = pathAt(actor.path, Math.min(1, k + 0.02));
      const vx = ahead.x - p.x, vy = ahead.y - p.y;
      let yaw;
      if (Math.hypot(vx, vy) > 1e-4) yaw = Math.atan2(vx, vy);
      else yaw = actor.facing_deg !== undefined ? deg(90 + actor.facing_deg) : 0.6;
      const sx = originX + p.x * view.plate.width * scale;
      const sy = originY + p.y * view.plate.height * scale;
      const size = actor.height * scale;
      rig.root.position.set(sx, -sy, sy * 0.5);
      rig.root.scale.setScalar(size);
      rig.root.rotation.set(deg(28), yaw, 0, 'XYZ');
      pose(rig, actor.gait, local + hash(actor.actor_id.length) * 3, actor.gait === 'knock' ? (S.knocks[shot.shot_id] || []).map((b) => b - shot.start) : []);
    }
    glCanvas.style.filter = glitch > 0 ? 'hue-rotate(' + Math.round(glitch * 70) + 'deg)' : 'none';
    renderer.render(scene3d, camera3d);
    if (view.shadows) {
      const spec = shot.windowShadows;
      view.shadows.figures.forEach((f, i) => {
        const appear = clamp((k - 0.15 - i * 0.18) / 0.2, 0, 1);
        f.style.opacity = String(appear * 0.85);
        f.style.left = (10 + i * 45 + Math.sin(local * 0.6 + i) * 8) + '%';
        f.style.transform = 'translateY(' + ((1 - appear) * 30) + '%)';
      });
      view.shadows.box.style.display = spec ? 'block' : 'none';
    }

    drawAtmosphere(t, view, local);
    if (glitch > 0) {
      for (let i = 0; i < 9; i++) {
        const y = noise(t, 40, i) * H, hgt = 10 + noise(t, 33, i + 9) * 70;
        ctx.fillStyle = i % 2 ? 'rgba(255,0,80,' + 0.35 * glitch + ')' : 'rgba(0,255,230,' + 0.3 * glitch + ')';
        ctx.fillRect((noise(t, 50, i + 3) - 0.5) * 160, y, W, hgt);
      }
    }

    const lo = S.lightsOut && t >= S.lightsOut.time && t < S.lightsOut.until ? clamp((t - S.lightsOut.time) / 0.12, 0, 1) : 0;
    lightsOut.style.opacity = String(lo * 0.55);

    flash.style.opacity = shot.transition_in === 'flash' && local < 0.28 ? String(1 - local / 0.28) : '0';
    const cut = S.cutToBlack;
    black.style.opacity = cut && t >= cut.time ? '1' : '0';

    // Title.
    const tt = S.title;
    const titleOn = t >= tt.start && t < tt.end;
    const tIn = clamp((t - tt.start) / 0.35, 0, 1), tOut = clamp((tt.end - t) / 0.35, 0, 1);
    title.style.opacity = titleOn ? String(Math.min(tIn, tOut)) : '0';
    title.style.transform = 'translateY(' + (1 - tIn) * -24 + 'px)';

    // Broadcast banner and intro terminal.
    const bc = S.broadcast;
    const bannerOn = t >= bc.start && t < bc.end;
    banner.style.opacity = bannerOn ? String(clamp((t - bc.start) / 0.2, 0, 1)) : '0';
    banner.classList.toggle('blink', Math.floor(t * 2) % 2 === 0);
    const intro = S.segments.find((s) => s.segment_id === bc.intro_segment_id);
    if (intro && t >= intro.start - 0.1 && t < intro.end + 0.4) {
      const spoken = intro.words.filter((w) => w.start <= t).map((w) => w.text).join(' ');
      const current = intro.words.find((w) => t >= w.start && t < w.end);
      let typed = spoken;
      if (current) typed = intro.words.filter((w) => w.end <= t).map((w) => w.text).join(' ') + (intro.words.some((w) => w.end <= t) ? ' ' : '') + current.text.slice(0, Math.ceil(current.text.length * clamp((t - current.start) / Math.max(0.05, current.end - current.start), 0, 1)));
      terminal.textContent = typed.toUpperCase() + (Math.floor(t * 3) % 2 ? '_' : ' ');
      terminal.style.opacity = '1';
    } else terminal.style.opacity = '0';

    // Rule card with spoken-word highlight.
    const seg = segmentAt(t);
    const ruleSpec = seg && S.rules[seg.segment_id];
    if (ruleSpec) {
      ruleNumber.textContent = 'RULE ' + String(ruleSpec.number).padStart(2, '0');
      const firstWord = ruleSpec.text.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9']/g, '');
      const from = Math.max(0, seg.words.findIndex((w) => w.key === firstWord));
      ruleText.innerHTML = seg.words.slice(from).map((w) => {
        const state = t >= w.end ? 'said' : t >= w.start ? 'now' : 'next';
        return '<span class="w ' + state + '">' + escapeHtml(w.text.toUpperCase()) + '</span>';
      }).join(' ');
      rule.style.opacity = String(clamp((t - seg.start + 0.05) / 0.15, 0, 1));
    } else rule.style.opacity = '0';

    // Captions for narration outside rule cards and the broadcast intro.
    if (seg && !ruleSpec && seg.segment_id !== bc.intro_segment_id) {
      const chunks = []; let chunk = [];
      seg.words.forEach((w, i) => { chunk.push(w); if (chunk.length === 3 || /[.,!?…]$/.test(w.text) || i === seg.words.length - 1) { chunks.push(chunk); chunk = []; } });
      const active = chunks.find((c) => t < c[c.length - 1].end + 0.08) || chunks[chunks.length - 1];
      caption.className = 'caption' + (seg.voice === 'double' ? ' double' : '');
      caption.innerHTML = active.map((w) => '<span class="' + (t >= w.start && t < w.end + 0.08 ? 'hot' : '') + '">' + escapeHtml(w.text.toUpperCase()) + '</span>').join(' ');
      caption.style.opacity = '1';
    } else caption.style.opacity = '0';
  }

  const state = { t: 0 };
  const tl = window.gsap.timeline({ paused: true });
  tl.to(state, { t: S.duration, duration: S.duration, ease: 'none', onUpdate: () => render(state.t) }, 0);
  window.__sceneTimeline = tl;
  window.__timelines = window.__timelines || {};
  window.__timelines['root'] = tl;
  render(0);
}
