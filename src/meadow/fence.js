// 草原场景 · 栅栏：环屋围栏（随地形起伏）+ 门口自动让位 + 半开木门
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';
import { terrainHeight, pathDistance } from './terrain.js';
import { barkTexture, woodPlankTexture } from './textures.js';

/** 圆角矩形周长采样（闭合） */
function roundedRect(cx, cz, halfW, halfD, r, step = 0.4) {
  const pts = [];
  const push = (x, z) => pts.push([x, z]);
  const line = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) push(x0 + (x1 - x0) * (i / n), z0 + (z1 - z0) * (i / n));
  };
  const arc = (ccx, ccz, a0, a1) => {
    for (let i = 0; i <= 12; i++) {
      const a = a0 + (a1 - a0) * (i / 12);
      push(ccx + Math.cos(a) * r, ccz + Math.sin(a) * r);
    }
  };
  const x0 = cx - halfW + r, x1 = cx + halfW - r;
  const z0 = cz - halfD + r, z1 = cz + halfD - r;
  push(cx + halfW, z0);
  line(cx + halfW, z0, cx + halfW, z1);
  arc(x1, z1, 0, Math.PI / 2);
  line(x1, cz + halfD, x0, cz + halfD);
  arc(x0, z1, Math.PI / 2, Math.PI);
  line(cx - halfW, z1, cx - halfW, z0);
  arc(x0, z0, Math.PI, Math.PI * 1.5);
  line(x0, cz - halfD, x1, cz - halfD);
  arc(x1, z0, Math.PI * 1.5, Math.PI * 2);
  return pts;
}

/** 折线按弧长等距重采样 */
function resample(pts, spacing) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    if (seg < 1e-6) continue;
    let t = 0;
    while (true) {
      const need = spacing - acc;
      if (t + need > seg) { acc += seg - t; break; }
      t += need;
      acc = 0;
      out.push([x0 + (x1 - x0) * (t / seg), z0 + (z1 - z0) * (t / seg)]);
      if (t >= seg) break;
    }
  }
  return out;
}

export function createFence({
  cx = 0.5, cz = 1.6, halfW = 13.2, halfD = 12.0, radius = 4.6,
  postSpacing = 2.45, railHeights = [0.38, 0.72, 1.06], seed = 3301,
} = {}) {
  const rnd = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'fence';

  const posts = resample(roundedRect(cx, cz, halfW, halfD, radius), postSpacing);

  const postGeos = [], railGeos = [], capGeos = [];
  const placed = [];

  for (const [x, z] of posts) {
    if (pathDistance(x, z) < 2.05) { placed.push(null); continue; }
    const y = terrainHeight(x, z);
    const h = 1.32 + rnd() * 0.14;
    const g = new THREE.CylinderGeometry(0.062, 0.078, h + 0.36, 9);
    g.translate(0, (h + 0.36) / 2, 0);
    g.rotateX((rnd() - 0.5) * 0.05);
    g.rotateZ((rnd() - 0.5) * 0.05);
    g.translate(x, y - 0.36 + (h + 0.36) / 2, z);
    postGeos.push(g);

    const cap = new THREE.CircleGeometry(0.062, 9);
    cap.rotateX(-Math.PI / 2);
    cap.translate(x, y + h, z);
    capGeos.push(cap);

    placed.push({ x, y, z, h });
  }

  // 横杆（相邻立柱间，随地形起伏微微倾斜）
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    const b = placed[(i + 1) % placed.length];
    if (!a || !b) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len > postSpacing * 2.2) continue;      // 跨过门口 → 断开
    const ang = Math.atan2(dx, dz);
    for (const rh of railHeights) {
      const ya = a.y + rh + (rnd() - 0.5) * 0.06;
      const yb = b.y + rh + (rnd() - 0.5) * 0.06;
      const g = new THREE.BoxGeometry(0.055, 0.13, len);
      g.rotateX(-Math.atan2(yb - ya, len));
      g.rotateZ((rnd() - 0.5) * 0.03);
      g.rotateY(ang);
      g.translate((a.x + b.x) / 2, (ya + yb) / 2, (a.z + b.z) / 2);
      railGeos.push(g);
    }
  }

  const postMat = new THREE.MeshStandardMaterial({
    map: barkTexture({ repeat: [2, 2], base: [134, 122, 102] }),
    roughness: 0.95, metalness: 0.0, envMapIntensity: 0.4,
  });
  const railMat = new THREE.MeshStandardMaterial({
    map: woodPlankTexture({ repeat: [1, 1], base: [150, 134, 110], plankCount: 1, seed: 23 }),
    roughness: 0.94, metalness: 0.0, envMapIntensity: 0.38,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x9a8a6e, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.35,
  });

  const addMerged = (geos, mat, name) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = m.receiveShadow = true;
    m.name = name;
    group.add(m);
  };
  addMerged(postGeos, postMat, 'fencePosts');
  addMerged(capGeos, capMat, 'fenceCaps');
  addMerged(railGeos, railMat, 'fenceRails');

  group.add(buildGate(rnd, postMat, railMat, cx, cz + halfD));
  return { group, materials: { postMat, railMat, capMat }, count: postGeos.length };
}

/* ---------------- 半开木门（立在道路穿出围栏的位置） ---------------- */
function buildGate(rnd, postMat, railMat, fenceCx, fenceZ) {
  const gx = fenceCx + 2.0, gz = fenceZ;
  const y = terrainHeight(gx, gz);
  const gw = 3.3, gh = 1.16;

  const g = new THREE.Group();
  g.name = 'fenceGate';

  // 门柱
  const postGeos = [];
  for (const s of [-1, 1]) {
    const pg = new THREE.CylinderGeometry(0.085, 0.105, 1.72, 9);
    pg.translate(gx + (s * gw) / 2, y + 0.66, gz);
    postGeos.push(pg);
  }
  const postMesh = new THREE.Mesh(mergeGeometries(postGeos, false), postMat);
  postMesh.castShadow = postMesh.receiveShadow = true;
  g.add(postMesh);

  // 门扇
  const frame = [];
  for (const s of [-1, 1]) {
    const stile = new THREE.BoxGeometry(0.08, gh, 0.11);
    stile.translate(s * (gw / 2 - 0.06), gh / 2, 0);
    frame.push(stile);
  }
  for (const rh of [0.24, 0.62, 1.0]) {
    const r0 = new THREE.BoxGeometry(gw - 0.1, 0.1, 0.06);
    r0.translate(0, rh, 0);
    frame.push(r0);
  }
  const diagLen = Math.hypot(gw - 0.14, gh * 0.8);
  const diag = new THREE.BoxGeometry(0.08, diagLen, 0.055);
  diag.rotateZ(Math.PI / 2 - Math.atan2(gh * 0.8, gw - 0.14));
  diag.translate(0, gh * 0.52, 0);
  frame.push(diag);

  const leaf = new THREE.Mesh(mergeGeometries(frame, false), railMat);
  leaf.castShadow = leaf.receiveShadow = true;
  leaf.position.x = gw / 2;          // 以左侧门柱为轴

  const hinge = new THREE.Group();
  hinge.add(leaf);
  hinge.position.set(gx - gw / 2, y, gz);
  hinge.rotation.y = -0.66;          // 半开
  g.add(hinge);

  return g;
}
