import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createDips } from './dips.js';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (t) => 1 - Math.pow(1 - t, 2);

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadTextures(renderer) {
  const loader = new THREE.TextureLoader();
  const base = `${import.meta.env.BASE_URL}img/tex/`;
  const names = ['poppadom', 'mango', 'mint', 'onion'];
  return Promise.all(names.map((n) => loader.loadAsync(`${base}${n}.jpg`))).then((list) => {
    const tex = Object.fromEntries(names.map((n, i) => [n, list[i]]));
    for (const t of list) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
    // the photo's disc touches the image edges; map the unit disc onto it
    tex.poppadom.repeat.set(0.485, 0.485);
    tex.poppadom.offset.set(0.5, 0.5);
    return tex;
  });
}

/* Height of the poppadom surface: a shallow curl plus the waves a real one gets when fried. */
function wave(x, y) {
  const r2 = x * x + y * y;
  const r = Math.sqrt(r2);
  const a = Math.atan2(y, x);
  return (
    0.05 * r2 +
    0.07 * r2 * Math.sin(3 * a + 0.6) +
    0.035 * r * Math.sin(5 * a + 1.7) +
    0.03 * Math.sin(x * 4.3 + 1) * Math.sin(y * 3.9 + 0.4) +
    0.012 * Math.sin(x * 9.1 + 1.3) * Math.sin(y * 7.7)
  );
}

const DEPTH = 0.014;
const tessellator = new TessellateModifier(0.07, 8);

function setNormalFromWave(pos, nrm, i) {
  const x = pos.getX(i);
  const y = pos.getY(i);
  const h = 1e-3;
  const dx = (wave(x + h, y) - wave(x - h, y)) / (2 * h);
  const dy = (wave(x, y + h) - wave(x, y - h)) / (2 * h);
  const len = Math.hypot(dx, dy, 1);
  nrm.setXYZ(i, -dx / len, -dy / len, 1 / len);
}

/* Top and bottom faces follow wave(); the broken edge is a strip joining their outlines. */
function shardGeometry(pts, cx, cy) {
  const top = tessellator.modify(new THREE.ShapeGeometry(new THREE.Shape(pts)));
  const pos = top.attributes.position;
  const nrm = top.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, wave(pos.getX(i), pos.getY(i)) + DEPTH / 2);
    setNormalFromWave(pos, nrm, i);
  }
  const bottom = top.clone();
  const bpos = bottom.attributes.position;
  for (let i = 0; i < bpos.count; i++) bpos.setZ(i, bpos.getZ(i) - DEPTH);

  const side = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const za = wave(a.x, a.y);
    const zb = wave(b.x, b.y);
    const ta = [a.x, a.y, za + DEPTH / 2];
    const tb = [b.x, b.y, zb + DEPTH / 2];
    const ba = [a.x, a.y, za - DEPTH / 2];
    const bb = [b.x, b.y, zb - DEPTH / 2];
    side.push(...ta, ...bb, ...tb, ...ta, ...ba, ...bb);
  }
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
  sides.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((side.length / 3) * 2), 2));
  sides.computeVertexNormals();

  const geo = mergeGeometries([top, bottom, sides], true);
  geo.translate(-cx, -cy, 0);
  return geo;
}

/* Splits a unit disc into jagged shards whose shared edges match exactly. */
function makeShards(rand) {
  const K = 10;
  const rOuter = (t) => 0.975 + 0.012 * Math.sin(t * 7 + 1.3) + 0.008 * Math.sin(t * 13 + 0.4) + 0.005 * Math.sin(t * 23);
  const rRing = (t) => 0.43 + 0.035 * Math.sin(t * 3 + 0.7) + 0.02 * Math.sin(t * 7 + 2);
  const at = (r, t) => new THREE.Vector2(r * Math.cos(t), r * Math.sin(t));

  const A = [];
  for (let i = 0; i < K; i++) A.push(((i + (rand() - 0.5) * 0.5) / K) * TAU);
  A.push(A[0] + TAU);

  const crack = (a, from, to, n = 7) => {
    const pts = [];
    for (let j = 0; j <= n; j++) {
      const f = j / n;
      const edgePt = j === 0 || j === n;
      const t = a + (edgePt ? 0 : (rand() - 0.5) * 0.12);
      const r = lerp(from(a), to(a), f) + (edgePt ? 0 : (rand() - 0.5) * 0.025);
      pts.push(at(r, t));
    }
    return pts;
  };
  const arcPts = (fn, a0, a1, steps = 6) => {
    const pts = [];
    for (let s = 1; s < steps; s++) {
      const t = lerp(a0, a1, s / steps);
      pts.push(at(fn(t), t));
    }
    return pts;
  };

  const outerCracks = A.slice(0, K).map((a) => crack(a, rRing, rOuter));
  outerCracks.push(outerCracks[0]);

  const shapes = [];
  for (let i = 0; i < K; i++) {
    shapes.push([
      ...outerCracks[i],
      ...arcPts(rOuter, A[i], A[i + 1], 14),
      ...[...outerCracks[i + 1]].reverse(),
      ...arcPts(rRing, A[i + 1], A[i], 6),
    ]);
  }

  const angle = (i) => A[i % K] + Math.floor(i / K) * TAU;
  const innerIdx = [0, 3, 5, 8];
  const innerCracks = innerIdx.map((i) => crack(A[i], () => 0, rRing, 4));
  for (let k = 0; k < innerIdx.length; k++) {
    const i0 = innerIdx[k];
    const i1 = k + 1 < innerIdx.length ? innerIdx[k + 1] : innerIdx[0] + K;
    const ring = [];
    for (let i = i0; i < i1; i++) {
      ring.push(...arcPts(rRing, angle(i), angle(i + 1), 6));
      if (i + 1 < i1) ring.push(at(rRing(angle(i + 1)), angle(i + 1)));
    }
    const back = [...innerCracks[(k + 1) % innerIdx.length]].reverse();
    shapes.push([...innerCracks[k], ...ring, ...back.slice(0, -1)]);
  }

  const cracks = [...outerCracks.slice(0, K), ...innerCracks];
  return { shapes, cracks };
}

export async function initPoppadom(hero, heroCopy) {
  const stage = hero.querySelector('.hero-stage');
  const canvas = hero.querySelector('.hero-canvas');
  const header = document.getElementById('header');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return false;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;

  let tex;
  try {
    tex = await loadTextures(renderer);
  } catch {
    renderer.dispose();
    return false;
  }

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 8);

  // warm raking key light so the blisters and waves read, a cool weak fill and a gold rim
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x1a0e06, 0.25));
  const key = new THREE.DirectionalLight(0xffdcae, 2.6);
  key.position.set(-6, 4, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffa850, 2.2);
  rim.position.set(4, -1.5, -3);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xd6e4ff, 0.3);
  fill.position.set(4, 1, 6);
  scene.add(fill);

  const rand = rng(20041);
  const faceMat = new THREE.MeshPhysicalMaterial({
    map: tex.poppadom,
    bumpMap: tex.poppadom,
    color: 0xfffaf0,
    bumpScale: 2.2,
    roughness: 0.7,
    clearcoat: 0.08,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.22,
    // thin fried dough lets a little warm light through
    sheen: 0.4,
    sheenColor: new THREE.Color(0xfff1d6),
    sheenRoughness: 0.6,
    side: THREE.DoubleSide,
  });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xf3e2c0, roughness: 0.8, envMapIntensity: 0.4, side: THREE.DoubleSide });

  const group = new THREE.Group();
  scene.add(group);

  // pieces heading towards the headline travel less so the copy stays readable
  const textSide = 0.35;
  const { shapes, cracks } = makeShards(rand);
  const shards = shapes.map((pts) => {
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(1 / pts.length);
    const mesh = new THREE.Mesh(shardGeometry(pts, c.x, c.y), [faceMat, faceMat, sideMat]);
    group.add(mesh);
    const dir = c.length() > 0.05 ? c.clone().normalize() : new THREE.Vector2(rand() - 0.5, rand() - 0.5).normalize();
    return {
      mesh,
      home: new THREE.Vector3(c.x, c.y, 0),
      dir: new THREE.Vector3(dir.x, dir.y, 0),
      spread: 0.9 + rand() * 1.5 + c.length() * 0.5,
      lift: 0.3 + rand() * 1,
      fall: 0.5 + rand() * 1,
      axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
      spin: (rand() - 0.5) * 7,
      wobble: (rand() - 0.5) * 0.06,
    };
  });

  const CRUMBS = 180;
  const crumbGeo = new THREE.DodecahedronGeometry(1, 0);
  const crumbMap = tex.poppadom.clone();
  crumbMap.repeat.set(0.12, 0.12);
  crumbMap.offset.set(0.44, 0.44);
  const crumbMat = new THREE.MeshStandardMaterial({ map: crumbMap, color: 0xfff4dc, roughness: 0.7, envMapIntensity: 0.4 });
  const materials = [faceMat, sideMat, crumbMat];
  for (const m of materials) m.transparent = true;
  const crumbMesh = new THREE.InstancedMesh(crumbGeo, crumbMat, CRUMBS);
  group.add(crumbMesh);
  const crumbs = Array.from({ length: CRUMBS }, () => {
    const line = cracks[Math.floor(rand() * cracks.length)];
    const p = line[Math.floor(rand() * line.length)];
    const sx = p.x + (rand() - 0.5) * 0.05;
    const sy = p.y + (rand() - 0.5) * 0.05;
    const start = new THREE.Vector3(sx, sy, wave(sx, sy));
    const out = new THREE.Vector3(sx, sy, 0);
    if (out.length() < 0.05) out.set(rand() - 0.5, rand() - 0.5, 0);
    out.normalize();
    const size = 0.006 + rand() * rand() * 0.03;
    return {
      start,
      vel: new THREE.Vector3(out.x * (0.4 + rand() * 1.8) + (rand() - 0.5) * 0.6, out.y * (0.4 + rand() * 1.8) + (rand() - 0.5) * 0.6, 0.2 + rand() * 1.4),
      fall: 1 + rand() * 2.5,
      // flakes rather than pebbles
      scale: new THREE.Vector3(size, size * (0.6 + rand() * 0.5), size * (0.18 + rand() * 0.2)),
      rot: new THREE.Euler(rand() * TAU, rand() * TAU, rand() * TAU),
      spin: (rand() - 0.5) * 12,
    };
  });

  const dips = createDips(tex, rand);
  scene.add(dips.group);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();

  let layout;
  function resize() {
    document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = (visH * camera.aspect) / 2;
    // Portrait screens get a full-screen sequence: the disc fills the screen and breaks,
    // the dips slide through, then the copy animates in once the screen is clear.
    if (portraitQuery.matches) {
      layout = {
        portrait: true, halfW, x: 0, y: visH * 0.03, s: Math.min(halfW * 0.94, visH * 0.3), fly: 1.9,
        rise: [0, 0.2], crack: [0.16, 0.26], burst: [0.26, 0.3], fade: [0.38, 0.52],
        dipX: 0, dipY: -visH * 0.01, dipUnit: Math.min(halfW * 0.72, visH * 0.24),
        dipsIn: [0.4, 0.14, 0.04], dipsOut: [0.74, 0.1, 0.03], caption: [0.55, 0.62, 0.72, 0.78], copy: [0.82, 1],
      };
    } else {
      const s = Math.min(visH * 0.32, halfW * 0.4);
      layout = {
        portrait: false, halfW, x: halfW * 0.42, y: visH * 0.02, s, fly: 1,
        rise: [0, 0.3], crack: [0.24, 0.36], burst: [0.36, 0.64], fade: null,
        dipX: halfW * 0.47, dipY: -visH * 0.03, dipUnit: Math.min(s * 0.68, halfW * 0.25),
        dipsIn: [0.42, 0.22, 0.07], dipsOut: null, caption: [0.7, 0.85, 2, 3], copy: null,
      };
    }
  }
  const portraitQuery = matchMedia('(max-aspect-ratio: 9 / 10)');

  function progress() {
    const r = hero.getBoundingClientRect();
    const travel = r.height - stage.offsetHeight;
    return travel > 0 ? clamp((header.offsetHeight - r.top) / travel) : 0;
  }

  // The disc idles with a slow spin that stops once it cracks, so shard directions
  // are turned by that angle into the group's frame before pieces fly.
  let spinA = 0;
  let last = 0;
  const spinQ = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const turn = (out, src, bias) => {
    const c = Math.cos(spinA);
    const s = Math.sin(spinA);
    out.set(src.x * c - src.y * s, src.x * s + src.y * c, src.z);
    if (bias && !layout.portrait && out.x < 0) out.x *= textSide;
    return out;
  };
  const d = new THREE.Vector3();

  function frame(time) {
    const p = progress();
    const t = time / 1000;
    const dt = last ? Math.min(0.1, t - last) : 0;
    last = t;
    const L = layout;
    const rise = smooth(L.rise[0], L.rise[1], p);
    const crack = smooth(L.crack[0], L.crack[1], p);
    const raw = clamp((p - L.burst[0]) / L.burst[1]);
    const burst = L.portrait ? raw : easeOut(raw);
    const fade = L.fade ? 1 - smooth(L.fade[0], L.fade[1], p) : 1;
    for (const m of materials) m.opacity = fade;
    group.visible = fade > 0;
    const shake = crack * (1 - smooth(L.crack[1] - 0.03, L.crack[1] + 0.01, p)) * Math.sin(t * 70) * 0.012;
    spinA += dt * 0.12 * (1 - crack);
    spinQ.setFromAxisAngle(zAxis, spinA);

    group.position.set(L.x + shake, L.y + Math.sin(t * 1.1) * 0.05 * (1 - burst) + lerp(0, 0.15, rise), 0);
    group.scale.setScalar(L.s * lerp(1, 1.05, rise));
    group.rotation.set(lerp(-0.95, -0.3, rise) + Math.sin(t * 0.7) * 0.04, lerp(0.4, 0.12, rise), 0);

    for (const s of shards) {
      const gap = crack * 0.03 + burst * s.spread * L.fly;
      turn(s.mesh.position, s.home, false).addScaledVector(turn(d, s.dir, true), gap);
      s.mesh.position.z += burst * s.lift;
      s.mesh.position.y -= burst * burst * s.fall;
      e.set(s.axis.x * s.spin * burst + crack * s.wobble, s.axis.y * s.spin * burst - crack * s.wobble, s.axis.z * s.spin * burst);
      s.mesh.quaternion.copy(spinQ).multiply(q.setFromEuler(e));
    }

    crumbMesh.visible = burst > 0;
    if (burst > 0) {
      const show = Math.min(1, burst * 10);
      crumbs.forEach((c, i) => {
        turn(v, c.start, false).addScaledVector(turn(d, c.vel, true), burst * L.fly);
        v.y -= burst * burst * c.fall;
        e.set(c.rot.x + c.spin * burst, c.rot.y + c.spin * burst, c.rot.z);
        q.setFromEuler(e);
        m4.compose(v, q, sc.copy(c.scale).multiplyScalar(show));
        crumbMesh.setMatrixAt(i, m4);
      });
      crumbMesh.instanceMatrix.needsUpdate = true;
    }

    dips.update(p, L, L.halfW);
    const [c0, c1, c2, c3] = L.caption;
    hero.style.setProperty('--dips', (smooth(c0, c1, p) * (1 - smooth(c2, c3, p))).toFixed(3));
    hero.style.setProperty('--hero-p', p.toFixed(3));
    if (L.copy) heroCopy.set(smooth(L.copy[0], L.copy[1], p));
    else heroCopy.play();
    renderer.render(scene, camera);
  }

  let visible = true;
  let raf = 0;
  const loop = (time) => {
    frame(time);
    raf = visible ? requestAnimationFrame(loop) : 0;
  };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(loop);
  }).observe(hero);
  new ResizeObserver(resize).observe(stage);

  hero.classList.add('is-3d');
  resize();
  raf = requestAnimationFrame(loop);
  return true;
}
