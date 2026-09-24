// 草原场景 · 植被与地景：松树 / 阔叶树 / 灌木 / 岩石
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise2, fbm2, clamp } from './noise.js';
import { terrainHeight, pathDistance } from './terrain.js';
import { barkTexture, stoneTexture, noiseBump } from './textures.js';

/** 用噪声沿径向扰动顶点，制造不规则轮廓 */
function roughen(geo, amp, freq, seed) {
  const pos = geo.attributes.position;
  const rnd = mulberry32(seed);
  const o = rnd() * 100;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const n = noise2(x * freq + o, z * freq + o * 0.7) + 0.5 * noise2(y * freq * 1.6 + o, r * freq + o);
    const k = 1 + n * amp;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
    pos.setY(i, y + n * amp * 0.35);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** 按高度写入顶点色，制造内部暗、外缘亮的体积感 */
function shadeByRadius(geo, inner, outer, jitter = 0.06, seed = 7) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const rnd = mulberry32(seed);
  let maxR = 1e-4;
  for (let i = 0; i < pos.count; i++) maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getZ(i)));
  const ci = new THREE.Color(inner), co = new THREE.Color(outer), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(Math.hypot(pos.getX(i), pos.getZ(i)) / maxR, 0, 1);
    tmp.copy(ci).lerp(co, t * t);
    const j = (rnd() - 0.5) * jitter;
    col[i * 3] = clamp(tmp.r + j, 0, 1);
    col[i * 3 + 1] = clamp(tmp.g + j, 0, 1);
    col[i * 3 + 2] = clamp(tmp.b + j, 0, 1);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function pineFoliageGeo(height, baseR, tiers, seed) {
  const rnd = mulberry32(seed);
  const geos = [];
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = height * (0.24 + f * 0.72);
    const r = baseR * (1 - f * 0.86) * (0.9 + rnd() * 0.22);
    const tierH = height * (0.24 + rnd() * 0.1);
    const g = new THREE.ConeGeometry(r, tierH, 9, 3, true);
    roughen(g, 0.34, 0.85, seed + t * 31);
    // 部分底缘顶点下压 → 形成下垂的枝叶剪影
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < -tierH * 0.4 && rnd() < 0.32) pos.setY(i, pos.getY(i) - tierH * (0.1 + rnd() * 0.28));
    }
    pos.needsUpdate = true;
    g.rotateY(rnd() * Math.PI * 2);
    g.translate(0, y, 0);
    geos.push(g);
  }
  const merged = mergeGeometries(geos.map((g) => { g.deleteAttribute('uv'); return g; }), false);
  shadeByRadius(merged, '#1e3316', '#43602a', 0.07, seed + 91);
  return merged;
}

function broadleafFoliageGeo(height, baseR, blobs, seed) {
  const rnd = mulberry32(seed);
  const geos = [];
  for (let b = 0; b < blobs; b++) {
    const r = baseR * (0.42 + rnd() * 0.42);
    const g = new THREE.IcosahedronGeometry(r, 2);
    roughen(g, 0.42, 1.5, seed + b * 47);
    const ang = rnd() * Math.PI * 2;
    const rad = baseR * 0.55 * Math.sqrt(rnd());
    g.rotateY(rnd() * 3);
    g.translate(Math.cos(ang) * rad, height * (0.5 + rnd() * 0.48), Math.sin(ang) * rad);
    geos.push(g);
  }
  const merged = mergeGeometries(geos.map((g) => { g.deleteAttribute('uv'); return g; }), false);
  shadeByRadius(merged, '#243a15', '#5d8430', 0.08, seed + 13);
  return merged;
}

function trunkGeo(height, r0, r1, seed, lean = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, height, 9, 4, true);
  const pos = g.attributes.position;
  const rnd = mulberry32(seed);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + height / 2) / height;
    const k = 0.94 + noise2(t * 6 + seed, seed * 0.3) * 0.14;
    pos.setX(i, pos.getX(i) * k + t * t * lean);
    pos.setZ(i, pos.getZ(i) * k);
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.translate(0, height / 2, 0);
  return g;
}

export function createNature({ seed = 8801 } = {}) {
  const rnd = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'nature';

  const barkMat = new THREE.MeshStandardMaterial({
    map: barkTexture({ repeat: [3, 4], base: [92, 74, 56] }),
    roughness: 0.95, metalness: 0.0, envMapIntensity: 0.35,
  });
  const needleMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.86, metalness: 0.0,
    side: THREE.DoubleSide, envMapIntensity: 0.45,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.84, metalness: 0.0, envMapIntensity: 0.5,
  });
  const bushMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.4,
  });
  const rockMat = new THREE.MeshStandardMaterial({
    map: stoneTexture({ repeat: [1, 1], base: [124, 124, 118] }),
    bumpMap: noiseBump({ size: 256, repeat: [2, 2], freq: 18, oct: 4, contrast: 1.4 }),
    bumpScale: 0.04,
    roughness: 0.92, metalness: 0.0, envMapIntensity: 0.45,
  });

  /** 找一个符合条件的撒点 */
  const pickSpot = (rMin, rMax, minPathDist, tries = 30, mustBeOutsideFence = true) => {
    for (let i = 0; i < tries; i++) {
      const r = rMin + (rMax - rMin) * Math.sqrt(rnd());
      const a = rnd() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (pathDistance(x, z) < minPathDist) continue;
      // 避开木屋与其场地
      if (Math.abs(x) < 6.5 && z > -5.5 && z < 6.0) continue;
      if (mustBeOutsideFence) {
        const insideFence = Math.abs(x - 0.5) < 13.2 && Math.abs(z - 1.6) < 12.0;
        if (insideFence) continue;
      }
      return [x, z];
    }
    return null;
  };

  /* ---------------- 松树 ---------------- */
  const trunkGeos = [], pineGeos = [];
  const pineCount = 17;
  for (let i = 0; i < pineCount; i++) {
    const spot = pickSpot(17, 44, 3.2);
    if (!spot) continue;
    const [x, z] = spot;
    const y = terrainHeight(x, z);
    const H = 7.5 + rnd() * 6.5;
    const sc = 0.9 + rnd() * 0.4;

    const tg = trunkGeo(H * 0.72, 0.17 * sc, 0.05 * sc, seed + i * 7, (rnd() - 0.5) * 0.3);
    tg.translate(x, y - 0.15, z);
    trunkGeos.push(tg);

    const fg = pineFoliageGeo(H, H * 0.21, 7, seed + i * 53);
    fg.rotateY(rnd() * Math.PI * 2);
    fg.scale(sc * 0.9, 1, sc * 0.9);
    fg.rotateX((rnd() - 0.5) * 0.04);
    fg.translate(x, y - 0.15, z);
    pineGeos.push(fg);
  }
  if (trunkGeos.length) {
    const t = new THREE.Mesh(mergeGeometries(trunkGeos, false), barkMat);
    t.castShadow = t.receiveShadow = true; t.name = 'treeTrunks';
    group.add(t);
  }
  if (pineGeos.length) {
    const f = new THREE.Mesh(mergeGeometries(pineGeos, false), needleMat);
    f.castShadow = f.receiveShadow = true; f.name = 'pines';
    group.add(f);
  }

  /* ---------------- 阔叶树 ---------------- */
  const blTrunks = [], blLeaves = [];
  for (let i = 0; i < 7; i++) {
    const spot = i < 2
      ? pickSpot(9, 14, 3.0, 40, false)      // 围栏内点缀两棵
      : pickSpot(16, 42, 3.6);
    if (!spot) continue;
    const [x, z] = spot;
    const y = terrainHeight(x, z);
    const H = 5.0 + rnd() * 4.0;
    const sc = 0.9 + rnd() * 0.35;

    const tg = trunkGeo(H * 0.55, 0.22 * sc, 0.11 * sc, seed + 300 + i * 11, (rnd() - 0.5) * 0.5);
    tg.translate(x, y - 0.15, z);
    blTrunks.push(tg);

    // 主枝
    for (let k = 0; k < 4; k++) {
      const bl = 0.13 * sc;
      const bg = new THREE.CylinderGeometry(0.045 * sc, bl, H * 0.42, 6, 1, true);
      bg.translate(0, H * 0.21, 0);
      bg.rotateZ(0.5 + rnd() * 0.55);
      bg.rotateY(rnd() * Math.PI * 2);
      bg.translate(x, y + H * 0.45, z);
      blTrunks.push(bg);
    }

    const lg = broadleafFoliageGeo(H, H * 0.36, 8, seed + 400 + i * 29);
    lg.scale(sc, 1, sc);
    lg.translate(x, y - 0.15, z);
    blLeaves.push(lg);
  }
  if (blTrunks.length) {
    const t = new THREE.Mesh(mergeGeometries(blTrunks, false), barkMat);
    t.castShadow = t.receiveShadow = true; t.name = 'broadleafTrunks';
    group.add(t);
  }
  if (blLeaves.length) {
    const f = new THREE.Mesh(mergeGeometries(blLeaves, false), leafMat);
    f.castShadow = f.receiveShadow = true; f.name = 'broadleafCanopy';
    group.add(f);
  }

  /* ---------------- 灌木 ---------------- */
  const bushGeos = [];
  for (let i = 0; i < 46; i++) {
    const r = 5 + Math.sqrt(rnd()) * 30;
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pathDistance(x, z) < 1.9) continue;
    if (Math.abs(x) < 5.2 && z > -4.6 && z < 5.0) continue;
    const y = terrainHeight(x, z);
    const rr = 0.34 + rnd() * 0.55;
    const g = new THREE.IcosahedronGeometry(rr, 1);
    roughen(g, 0.5, 2.2, seed + i * 17);
    g.scale(1.15, 0.72 + rnd() * 0.3, 1.15);
    g.rotateY(rnd() * 3);
    g.translate(x, y + rr * 0.5, z);
    bushGeos.push(g);
  }
  if (bushGeos.length) {
    const merged = mergeGeometries(bushGeos.map((g) => { g.deleteAttribute('uv'); return g; }), false);
    shadeByRadius(merged, '#1d3013', '#4e7429', 0.09, seed + 5);
    const m = new THREE.Mesh(merged, bushMat);
    m.castShadow = m.receiveShadow = true; m.name = 'bushes';
    group.add(m);
  }

  /* ---------------- 岩石 ---------------- */
  const rockGeos = [];
  for (let i = 0; i < 54; i++) {
    const r = 2.5 + Math.sqrt(rnd()) * 34;
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pathDistance(x, z) < 1.5) continue;
    if (Math.abs(x) < 4.8 && z > -4.2 && z < 4.6) continue;
    const y = terrainHeight(x, z);
    const rr = 0.16 + Math.pow(rnd(), 2.2) * 0.72;
    const g = new THREE.IcosahedronGeometry(rr, 1);
    roughen(g, 0.55, 1.8, seed + 900 + i * 23);
    g.scale(1 + rnd() * 0.5, 0.62 + rnd() * 0.4, 1 + rnd() * 0.5);
    g.rotateY(rnd() * 3);
    g.rotateX((rnd() - 0.5) * 0.4);
    g.translate(x, y + rr * 0.28 - 0.05, z);
    rockGeos.push(g);
  }
  if (rockGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(rockGeos, false), rockMat);
    m.castShadow = m.receiveShadow = true; m.name = 'rocks';
    group.add(m);
  }

  return { group, materials: { barkMat, needleMat, leafMat, bushMat, rockMat } };
}
