// Browser runtime for one isometric story. Every frame is drawn from the timeline
// time alone, so Hyperframes can seek to any frame and get the same picture.
(function () {
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
  const svgNS = 'http://www.w3.org/2000/svg';

  const world = el('div', 'world');
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

  // Clay rigs ---------------------------------------------------------------
  const PALETTE = {
    hero: { coat: '#f0a92a', coatDark: '#b8741a', skin: '#f2c9a0', pants: '#2c3446', hood: true, eye: '#1d1d1d' },
    zombie: { coat: '#45607a', coatDark: '#2b3d4f', skin: '#8fae6a', pants: '#3a3226', hood: false, eye: '#e9f2c4' },
    double: { coat: '#9a7a2a', coatDark: '#5e4612', skin: '#bfa184', pants: '#1e2330', hood: true, eye: '#ff2a2a' },
  };

  function part(parent, d, fill, extra) {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', fill);
    if (extra) Object.entries(extra).forEach(([k, v]) => p.setAttribute(k, v));
    parent.appendChild(p); return p;
  }
  function group(parent) { const g = document.createElementNS(svgNS, 'g'); parent.appendChild(g); return g; }

  function buildRig(actor, parent) {
    const colors = PALETTE[actor.rig];
    const box = el('div', 'actor', parent);
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '-40 -130 80 136');
    box.appendChild(svg);
    const defs = document.createElementNS(svgNS, 'defs');
    defs.innerHTML = '<radialGradient id="clay-' + actor.actor_id + '-' + actor.rig + '" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient>';
    svg.appendChild(defs);
    const sheen = 'url(#clay-' + actor.actor_id + '-' + actor.rig + ')';
    part(svg, 'M-22 2 a22 6 0 1 0 44 0 a22 6 0 1 0 -44 0', 'rgba(0,0,0,0.45)');
    const body = group(svg);
    const legL = group(body); const legR = group(body);
    part(legL, 'M-11 -46 h10 v42 a5 4 0 0 1 -5 4 h-6 a4 4 0 0 1 -4 -4 z', colors.pants);
    part(legL, 'M-15 -4 h15 a3 3 0 0 1 0 6 h-15 a3 3 0 0 1 0 -6 z', '#1a1a1a');
    part(legR, 'M1 -46 h10 v42 a5 4 0 0 1 -5 4 h-6 a4 4 0 0 1 -4 -4 z', colors.pants);
    part(legR, 'M0 -4 h15 a3 3 0 0 1 0 6 h-15 a3 3 0 0 1 0 -6 z', '#1a1a1a');
    const torso = group(body);
    const armBack = group(torso);
    part(armBack, 'M-6 -86 h11 v36 a6 6 0 0 1 -11 0 z', colors.coatDark);
    part(torso, 'M-17 -92 q17 -10 34 0 l3 50 q-20 8 -40 0 z', colors.coat);
    part(torso, 'M-17 -92 q17 -10 34 0 l3 50 q-20 8 -40 0 z', sheen);
    if (actor.rig === 'zombie') part(torso, 'M-14 -60 l6 6 l5 -7 l6 8 l5 -6 l6 7 l3 -4 v10 q-18 6 -34 0 z', colors.coatDark);
    const head = group(torso);
    part(head, 'M-15 -108 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0', colors.skin);
    if (colors.hood) part(head, 'M-18 -106 q0 -22 18 -22 q18 0 18 22 q-3 -12 -18 -12 q-15 0 -18 12 z', colors.coat);
    part(head, 'M-15 -108 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0', sheen);
    part(head, 'M2 -110 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0', colors.eye);
    part(head, 'M9 -110 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0', colors.eye);
    if (actor.rig === 'zombie') part(head, 'M3 -100 q5 3 10 0', 'none', { stroke: '#3b2a1a', 'stroke-width': '2' });
    const armFront = group(torso);
    part(armFront, 'M-5 -86 h11 v36 a6 6 0 0 1 -11 0 z', colors.coat);
    part(armFront, 'M-5 -86 h11 v36 a6 6 0 0 1 -11 0 z', sheen);
    part(armFront, 'M-5 -52 a5.5 5.5 0 1 0 11 0 a5.5 5.5 0 1 0 -11 0', colors.skin);
    if (actor.carrying === 'grocery-bag') {
      part(armFront, 'M-9 -54 h18 l2 22 h-22 z', '#b08350');
      part(armFront, 'M-6 -56 q2 -6 6 -2 q3 -5 6 1', '#7aa84a');
    }
    return { box, svg, body, legL, legR, torso, armFront, armBack, head };
  }

  function pose(rig, gait, t, knocks) {
    let legSwing = 0, armSwing = 0, armRaise = 0, lean = 0, bob = 0, headTilt = 0, breathe = 1;
    if (gait === 'walk') { const p = Math.sin(t * Math.PI * 2 * 1.7); legSwing = 24 * p; armSwing = -20 * p; bob = Math.abs(p) * 2.5; lean = 3; }
    else if (gait === 'run') { const p = Math.sin(t * Math.PI * 2 * 2.9); legSwing = 42 * p; armSwing = -40 * p; bob = Math.abs(p) * 5; lean = 12; }
    else if (gait === 'shamble') { const p = Math.sin(t * Math.PI * 2 * 1.05); legSwing = 14 * p; armRaise = -78 + 6 * Math.sin(t * 5.1); lean = 9 + 3 * p; bob = Math.abs(p) * 2; headTilt = 14 + 6 * Math.sin(t * 1.7); }
    else if (gait === 'lunge') { const p = Math.sin(t * Math.PI * 2 * 2.2); legSwing = 30 * p; armRaise = -85 + 8 * p; lean = 16; bob = Math.abs(p) * 4; headTilt = 8; }
    else if (gait === 'knock') {
      breathe = 1 + 0.012 * Math.sin(t * 2.4);
      for (const beat of knocks) {
        for (const rap of [0, 0.2, 0.4]) {
          const d = t - (beat + rap);
          if (d >= -0.08 && d < 0.14) armRaise = Math.min(armRaise, -95 - 25 * Math.sin(clamp((d + 0.08) / 0.22, 0, 1) * Math.PI));
        }
        if (t >= beat - 0.25 && t < beat + 0.75 && armRaise === 0) armRaise = -95;
      }
      lean = 4;
    } else { breathe = 1 + 0.015 * Math.sin(t * 2.2); }
    rig.legL.setAttribute('transform', 'rotate(' + legSwing + ' -6 -46)');
    rig.legR.setAttribute('transform', 'rotate(' + -legSwing + ' 6 -46)');
    rig.armFront.setAttribute('transform', 'rotate(' + (armSwing + armRaise) + ' 0 -84)');
    rig.armBack.setAttribute('transform', 'rotate(' + (-armSwing + armRaise * 0.9) + ' 0 -84)');
    rig.head.setAttribute('transform', 'rotate(' + headTilt + ' 0 -96)');
    rig.torso.setAttribute('transform', 'translate(0 ' + -bob + ') rotate(' + lean + ' 0 -46) scale(1 ' + breathe + ')');
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
    const actors = shot.actors.map((actor) => ({ actor, rig: buildRig(actor, wrap) }));
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

    for (const { actor, rig } of view.actors) {
      const visible = actor.enter_at === undefined || k >= actor.enter_at;
      rig.box.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      const p = pathAt(actor.path, k);
      const ahead = pathAt(actor.path, Math.min(1, k + 0.02));
      let faceLeft = ahead.x < p.x - 1e-4;
      if (Math.abs(ahead.x - p.x) < 1e-4 && actor.facing_deg !== undefined) faceLeft = Math.abs(actor.facing_deg) > 90;
      const h = actor.height;
      rig.box.style.width = h * 0.6 + 'px';
      rig.box.style.height = h + 'px';
      rig.box.style.left = p.x * view.plate.width - h * 0.3 + 'px';
      rig.box.style.top = p.y * view.plate.height - h + 'px';
      rig.box.style.zIndex = String(Math.round(p.y * 1000));
      rig.svg.style.transform = faceLeft ? 'scaleX(-1)' : 'none';
      pose(rig, actor.gait, local + hash(actor.actor_id.length) * 3, actor.gait === 'knock' ? (S.knocks[shot.shot_id] || []).map((b) => b - shot.start) : []);
    }
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
  render(0);
})();
