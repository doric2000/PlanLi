import * as THREE from 'three';
import regions from '../atlasRegions.json';

// This module is bundled into a self-contained document by scripts/buildAtlas.js.
const assets = __ATLAS_ASSETS__;
const channel = window.__ATLAS_CHANNEL__;
const canvas = document.querySelector('canvas');
const stage = document.querySelector('main');
const notify = (type, detail = {}) => {
  const message = JSON.stringify({ channel, type, ...detail });
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
  else window.parent.postMessage(message, '*');
};
const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
});
function cover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale, h = image.height * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

let dispose = () => {};
async function start() {
  const font = new FontFace('Assistant', 'url(' + assets.font + ')');
  await font.load(); document.fonts.add(font);
  const photos = await Promise.all(regions.map((r) => loadImage(assets.photos[r.id])));
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 390 / 282, .1, 20);
  camera.position.z = 3.9;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 4096; textureCanvas.height = 2048;
  const ctx = textureCanvas.getContext('2d');
  ctx.fillStyle = '#0d2a43'; ctx.fillRect(0, 0, 4096, 2048); ctx.beginPath();
  for (const feature of assets.land.features) {
    const polygons = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates];
    for (const rings of polygons) for (const ring of rings) {
      if (ring.every((p) => p[1] < -60)) continue;
      ring.forEach((p, i) => {
        const x = (p[0] + 180) / 360 * 4096, y = (90 - p[1]) / 180 * 2048;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  }
  ctx.fillStyle = '#477988'; ctx.fill('evenodd');
  ctx.strokeStyle = '#aac9c5'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = '#7aa1ab25'; ctx.lineWidth = 1;
  for (let lon = -180; lon < 180; lon += 20) {
    ctx.beginPath(); ctx.moveTo((lon + 180) / 360 * 4096, 0); ctx.lineTo((lon + 180) / 360 * 4096, 2048); ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 20) {
    ctx.beginPath(); ctx.moveTo(0, (90 - lat) / 180 * 2048); ctx.lineTo(4096, (90 - lat) / 180 * 2048); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .9, metalness: .04 });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 100), material);
  scene.add(globe); scene.add(new THREE.AmbientLight(0xbfe4f2, 1.8));
  const sun = new THREE.DirectionalLight(0xfff4da, 2.1); sun.position.set(-3, 4, 5); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x96dfea, 1.4); rim.position.set(4, 1, -2); scene.add(rim);
  const overlay = document.createElement('canvas'); overlay.className = 'photos'; overlay.setAttribute('aria-hidden', 'true');
  stage.appendChild(overlay); const oc = overlay.getContext('2d');
  const state = { regionId: null, active: true, reducedMotion: false, spinning: true };
  const rotation = { x: .8378, y: -1.8675 };
  let target = null, velocity = 0, down = null, last = 0, animation = 0, stopped = false;
  let stoppedUntil = performance.now() + 12000;
  const markers = regions.map((r) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'marker';
    button.setAttribute('aria-label', 'בחירת ' + r.label); button.dataset.region = r.id;
    // Accessibility activation emits a click without pointer events (detail 0).
    // Physical taps/drags are handled by the stage, avoiding duplicate selection.
    button.addEventListener('click', (event) => {
      if (event.detail !== 0 || !state.active) return;
      stopSpinning(); focus(r.id, true);
    });
    stage.appendChild(button); return button;
  });
  function focus(regionId, user = false) {
    const region = regions.find((r) => r.id === regionId);
    state.regionId = region?.id || null;
    if (region) target = { x: region.lat * Math.PI / 180, y: -(region.lon + 90) * Math.PI / 180 };
    if (state.reducedMotion && target) { Object.assign(rotation, target); target = null; }
    velocity = 0; stoppedUntil = performance.now() + 12000;
    if (user && region) notify('select', { regionId: region.id });
    schedule();
  }
  const point = (r) => {
    const a = r.lat * Math.PI / 180, b = r.lon * Math.PI / 180;
    return new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b));
  };
  function drawPhotos() {
    const sw = stage.clientWidth, sh = stage.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    const scale = Math.min(sw / 390, 1.15);
    if (overlay.width !== Math.round(sw * dpr) || overlay.height !== Math.round(sh * dpr)) {
      overlay.width = Math.round(sw * dpr); overlay.height = Math.round(sh * dpr);
    }
    oc.setTransform(dpr, 0, 0, dpr, 0, 0); oc.clearRect(0, 0, sw, sh);
    oc.strokeStyle = '#9ab7c425'; oc.lineWidth = 1; oc.beginPath();
    oc.ellipse(sw / 2, sh / 2, sw * .45, sh * .40, -.18, 0, Math.PI * 2); oc.stroke();
    const points = regions.map((r, i) => {
      const p = point(r).applyMatrix4(globe.matrixWorld), v = p.clone().project(camera);
      return { i, selected: r.id === state.regionId, z: p.z, x: (v.x + 1) / 2 * sw, y: (-v.y + 1) / 2 * sh };
    }).filter((p) => p.z > .25).sort((a, b) => Number(b.selected) - Number(a.selected) || b.z - a.z);
    const occupied = [];
    markers.forEach((button) => { button.style.display = 'none'; button.tabIndex = -1; });
    for (const p of points) {
      const w = (p.selected ? 116 : 90) * scale, h = (p.selected ? 82 : 66) * scale;
      const offsets = p.selected ? [[0, -49], [0, -62]] : [[0, -25], [-57, 6], [57, 6], [-38, 45], [38, 45]];
      let spot = null;
      for (const [dx, dy] of offsets) {
        const x = Math.max(w / 2 + 10, Math.min(sw - w / 2 - 10, p.x + dx * scale));
        const y = Math.max(h / 2 + 8, Math.min(sh - h / 2 - 8, p.y + dy * scale));
        if (!occupied.some((a) => Math.abs(a.x - x) < (a.w + w) / 2 + 8 && Math.abs(a.y - y) < (a.h + h) / 2 + 8)) {
          spot = { x, y, w, h }; break;
        }
      }
      if (!spot || occupied.length >= 3) continue;
      occupied.push(spot);
      const { x: cx, y: cy } = spot, x = cx - w / 2, y = cy - h / 2;
      oc.strokeStyle = p.selected ? '#ffbc69' : '#abc9d080'; oc.lineWidth = 1;
      oc.beginPath(); oc.moveTo(p.x, p.y); oc.lineTo(cx, cy + h / 2 - 2); oc.stroke();
      oc.beginPath(); oc.arc(p.x, p.y, p.selected ? 4 : 2.5, 0, Math.PI * 2);
      oc.fillStyle = p.selected ? '#ffb34d' : '#bed3d7'; oc.fill();
      oc.save(); oc.shadowColor = '#0008'; oc.shadowBlur = 12; oc.shadowOffsetY = 5;
      oc.beginPath(); oc.roundRect(x, y, w, h, 12); oc.fillStyle = '#0b2238'; oc.fill();
      oc.shadowBlur = 0; oc.shadowOffsetY = 0; oc.clip(); cover(oc, photos[p.i], x, y, w, h);
      const gradient = oc.createLinearGradient(x, y + h * .35, x, y + h);
      gradient.addColorStop(0, '#071b2900'); gradient.addColorStop(1, '#071b29ef');
      oc.fillStyle = gradient; oc.fillRect(x, y, w, h);
      oc.direction = 'rtl'; oc.textAlign = 'center'; oc.fillStyle = '#fff';
      oc.font = (p.selected ? 14 : 11) * scale + 'px Assistant';
      oc.fillText(regions[p.i].label, cx, y + h - 11 * scale, w - 8); oc.restore();
      oc.beginPath(); oc.roundRect(x, y, w, h, 12); oc.lineWidth = p.selected ? 2 : 1;
      oc.strokeStyle = p.selected ? '#ffbf73' : '#cedee585'; oc.stroke();
      const button = markers[p.i]; button.style.display = 'block'; button.style.left = cx + 'px';
      button.style.top = cy + 'px'; button.style.width = w + 'px'; button.style.height = h + 'px'; button.tabIndex = 0;
      button.setAttribute('aria-pressed', String(p.selected));
    }
  }
  function frame(time) {
    animation = 0;
    if (!state.active || document.hidden || stopped) return;
    const dt = Math.min(2, (time - last) / 16.666) || 1; last = time;
    if (target) {
      let dy = target.y - rotation.y;
      while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      rotation.y += dy * .10; rotation.x += (target.x - rotation.x) * .10;
      if (Math.abs(dy) < .002 && Math.abs(target.x - rotation.x) < .002) target = null;
    } else if (!down && !state.reducedMotion) {
      rotation.y += velocity * dt; velocity *= Math.pow(.94, dt);
      if (state.spinning && time > stoppedUntil) rotation.y += .00045 * dt;
    }
    globe.rotation.set(rotation.x, rotation.y, 0, 'XYZ'); globe.updateMatrixWorld();
    drawPhotos(); renderer.render(scene, camera);
    if (target || down || (!state.reducedMotion && (state.spinning || Math.abs(velocity) > .00005))) schedule();
  }
  function schedule() {
    if (!animation && state.active && !document.hidden && !stopped) animation = requestAnimationFrame(frame);
  }
  function update(next) {
    if (!next || next.channel !== channel || next.type !== 'state') return;
    const previousRegion = state.regionId;
    state.active = next.active === true; state.reducedMotion = next.reducedMotion === true;
    state.spinning = next.spinning === true;
    if (next.regionId == null || regions.some((r) => r.id === next.regionId)) state.regionId = next.regionId || null;
    if (previousRegion !== state.regionId) focus(state.regionId);
    if (state.reducedMotion) {
      velocity = 0;
      if (target) { Object.assign(rotation, target); target = null; }
    }
    if (!state.active) { cancelAnimationFrame(animation); animation = 0; down = null; }
    else schedule();
  }
  window.planliAtlas = { update };
  const receive = (event) => {
    if (event.source && event.source !== window.parent && event.source !== window) return;
    try { update(typeof event.data === 'string' ? JSON.parse(event.data) : event.data); } catch { /* Ignore unrelated messages. */ }
  };
  window.addEventListener('message', receive);
  const stopSpinning = () => { state.spinning = false; notify('interaction'); };
  stage.addEventListener('pointerdown', (event) => {
    if (!state.active) return;
    stopSpinning(); target = null; velocity = 0;
    down = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, regionId: event.target.dataset.region };
    stage.setPointerCapture(event.pointerId); schedule();
  });
  stage.addEventListener('pointermove', (event) => {
    if (!down) return;
    const dx = event.clientX - down.x, dy = event.clientY - down.y;
    rotation.y += dx * .008; rotation.x = Math.max(-.8, Math.min(.8, rotation.x + dy * .006));
    velocity = state.reducedMotion ? 0 : Math.max(-.035, Math.min(.035, dx * .008));
    down.x = event.clientX; down.y = event.clientY; schedule();
  });
  const raycaster = new THREE.Raycaster();
  stage.addEventListener('pointerup', (event) => {
    if (!down) return;
    const tap = Math.hypot(event.clientX - down.startX, event.clientY - down.startY) < 7, regionId = down.regionId;
    down = null;
    if (tap && regionId) focus(regionId, true);
    else if (tap) {
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObject(globe)[0];
      if (hit) {
        const lon = hit.uv.x * 360 - 180, lat = hit.uv.y * 180 - 90;
        const distance = (r) => Math.acos(Math.max(-1, Math.min(1,
          Math.sin(lat * Math.PI / 180) * Math.sin(r.lat * Math.PI / 180)
          + Math.cos(lat * Math.PI / 180) * Math.cos(r.lat * Math.PI / 180) * Math.cos((lon - r.lon) * Math.PI / 180))));
        focus([...regions].sort((a, b) => distance(a) - distance(b))[0].id, true);
      }
    }
    schedule();
  });
  stage.addEventListener('pointercancel', () => { down = null; velocity = 0; });
  stage.addEventListener('keydown', (event) => {
    if (!state.active) return;
    if ((event.key === 'Enter' || event.key === ' ') && event.target.dataset.region) {
      event.preventDefault(); stopSpinning(); focus(event.target.dataset.region, true); return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); stopSpinning(); target = null;
    if (event.key === 'ArrowLeft') rotation.y -= .18;
    if (event.key === 'ArrowRight') rotation.y += .18;
    if (event.key === 'ArrowUp') rotation.x = Math.max(-.8, rotation.x - .12);
    if (event.key === 'ArrowDown') rotation.x = Math.min(.8, rotation.x + .12);
    schedule();
  });
  const resize = () => {
    if (!stage.clientWidth || !stage.clientHeight) return;
    camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix();
    renderer.setSize(stage.clientWidth, stage.clientHeight, false); schedule();
  };
  const observer = new ResizeObserver(resize); observer.observe(stage);
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(animation); animation = 0; } else schedule(); };
  document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); dispose(); notify('error'); });
  dispose = () => {
    stopped = true; cancelAnimationFrame(animation); observer.disconnect();
    window.removeEventListener('message', receive); document.removeEventListener('visibilitychange', visibility);
    globe.geometry.dispose(); material.dispose(); texture.dispose(); renderer.dispose();
  };
  window.addEventListener('pagehide', dispose, { once: true });
  resize(); notify('ready'); schedule();
}
start().catch(() => { dispose(); notify('error'); });
