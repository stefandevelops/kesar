import * as THREE from 'three';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOutBack = (t) => {
  const c = 1.2;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const easeIn = (t) => t * t * t;

// Glossy fruit chutney, thick yoghurt and a wet chopped-onion relish behave very differently under light.
const SAUCES = [
  { tex: 'mango', repeat: 0.85, heap: 0.03, lumps: 0.008, material: { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, bumpScale: 1.6 } },
  { tex: 'mint', repeat: 0.8, heap: 0.012, lumps: 0.003, desaturate: 0.45, material: { roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.3, bumpScale: 0.5 } },
  { tex: 'onion', repeat: 0.75, heap: 0.036, lumps: 0.01, material: { roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.12, bumpScale: 2 } },
];

function shadowTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.42, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.15)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

// Glossy white dip bowl like a ramekin with a tab handle, in bowl units: radius 0.47, height 0.36.
// Steep walls, a softly rounded base and a thin rim.
const PROFILE = [
  [0, 0.04], [0.25, 0.045], [0.36, 0.07], [0.41, 0.12], [0.43, 0.2], [0.44, 0.3], [0.444, 0.345],
  [0.452, 0.36], [0.464, 0.357], [0.47, 0.34], [0.468, 0.24], [0.458, 0.13], [0.43, 0.05],
  [0.38, 0.012], [0.33, 0.004], [0.32, 0], [0.28, 0], [0.275, 0.012], [0, 0.014],
].map(([x, y]) => new THREE.Vector2(x, y));
const SAUCE_Y = 0.3;
const SAUCE_R = 0.438;

function handleGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.455, 0.3, -0.1),
    new THREE.Vector3(0.56, 0.315, -0.095),
    new THREE.Vector3(0.62, 0.32, 0),
    new THREE.Vector3(0.56, 0.315, 0.095),
    new THREE.Vector3(0.455, 0.3, 0.1),
  ]);
  return new THREE.TubeGeometry(curve, 40, 0.026, 12, false);
}

// Matte black cast-iron serving platter, top surface at y = 0.
function platterGeometry(rx, rz) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, rx, rz, 0, Math.PI * 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.04, bevelSegments: 6, curveSegments: 96 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, -0.025, 0);
  return geo;
}

function sauceGeometry(heap, lumps, seed) {
  const geo = new THREE.RingGeometry(0.001, SAUCE_R, 96, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y) / SAUCE_R;
    const dome = heap * (1 - r * r);
    const bumps = lumps * Math.sin(x * 31 + seed) * Math.sin(y * 27 - seed) * (1 - r);
    pos.setZ(i, dome + bumps);
  }
  geo.computeVertexNormals();
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/* Three dip bowls that slide in after the poppadom breaks. Positions are in "bowl units";
   update() places the whole set using the layout computed by the hero scene. */
export function createDips(tex, rand) {
  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0xfbfaf7,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.1,
    side: THREE.DoubleSide,
  });
  const bowlGeo = new THREE.LatheGeometry(PROFILE, 96);
  const handleGeo = handleGeometry();
  const iron = new THREE.MeshPhysicalMaterial({ color: 0x161514, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.6 });
  const platters = { row: new THREE.Mesh(platterGeometry(1.85, 0.82), iron), triangle: new THREE.Mesh(platterGeometry(1.32, 1.2), iron) };
  platters.triangle.position.z = -0.06;
  const shadowGeo = new THREE.PlaneGeometry(1.7, 1.7);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });

  const group = new THREE.Group();
  group.add(platters.row, platters.triangle);
  const bowls = SAUCES.map((sauce, i) => {
    const bowl = new THREE.Group();
    bowl.add(new THREE.Mesh(bowlGeo, ceramic));
    const handle = new THREE.Mesh(handleGeo, ceramic);
    bowl.add(handle);
    const map = tex[sauce.tex];
    map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping;
    map.repeat.set(sauce.repeat, sauce.repeat);
    map.offset.set((1 - sauce.repeat) / 2, (1 - sauce.repeat) / 2);
    const sauceMat = new THREE.MeshPhysicalMaterial({ map, bumpMap: map, envMapIntensity: 0.8, ...sauce.material });
    if (sauce.desaturate) {
      // the warm key light pushes yoghurt towards lime; pull it back to a pale sage
      sauceMat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), ${sauce.desaturate.toFixed(2)});`,
        );
      };
    }
    const surface = new THREE.Mesh(sauceGeometry(sauce.heap, sauce.lumps, rand() * 10), sauceMat);
    surface.position.y = SAUCE_Y;
    surface.rotation.y = rand() * Math.PI * 2;
    bowl.add(surface);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.004;
    bowl.add(shadow);
    group.add(bowl);
    return { bowl, handle, delay: i };
  });

  const ROW = [[-1.08, 0.12], [0, -0.16], [1.08, 0.12]];
  const TRIANGLE = [[-0.54, 0.4], [0.54, 0.4], [0, -0.52]];
  // handle directions (rotation about y) chosen so no handle touches a neighbouring bowl
  const HANDLES = { row: [Math.PI, Math.PI / 2, 0], triangle: [Math.PI, 0, Math.PI / 2] };

  // layout.dipsIn / dipsOut are [start, length, stagger] in scroll progress
  function update(p, layout, halfW) {
    const homes = layout.portrait ? TRIANGLE : ROW;
    const unit = layout.dipUnit;
    group.position.set(layout.dipX, layout.dipY, 0);
    group.scale.setScalar(unit);
    group.rotation.set(0.62, 0, 0);
    const travel = (halfW * 2) / unit + 1.5;
    const [inStart, inLen, inStagger] = layout.dipsIn;

    // the platter lands just ahead of the first bowl and leaves with the last one
    const platter = layout.portrait ? platters.triangle : platters.row;
    platters.row.visible = platters.triangle.visible = false;
    const pa = clamp((p - inStart + inStagger) / inLen);
    let pOut = 0;
    if (layout.dipsOut) {
      const [outStart, outLen, outStagger] = layout.dipsOut;
      pOut = easeIn(clamp((p - outStart - 2 * outStagger) / outLen));
    }
    platter.visible = pa > 0 && pOut < 1;
    platter.position.x = (1 - (1 - Math.pow(1 - pa, 3))) * travel - pOut * travel;

    let any = platter.visible;
    for (const b of bowls) {
      const a = clamp((p - inStart - b.delay * inStagger) / inLen);
      let out = 0;
      if (layout.dipsOut) {
        const [outStart, outLen, outStagger] = layout.dipsOut;
        out = easeIn(clamp((p - outStart - b.delay * outStagger) / outLen));
      }
      const arrive = easeOutBack(a);
      const [hx, hz] = homes[b.delay];
      b.handle.rotation.y = HANDLES[layout.portrait ? 'triangle' : 'row'][b.delay];
      b.bowl.visible = a > 0 && out < 1;
      any ||= b.bowl.visible;
      b.bowl.position.set(hx + (1 - arrive) * travel - out * travel, 0, hz);
      // sliding across a table: a small tilt into the direction of travel, no cartoon spin
      b.bowl.rotation.set(0, (1 - a) * 0.6 - out * 0.4, (1 - arrive) * 0.08 + out * 0.06);
    }
    group.visible = any;
  }

  return { group, update };
}
