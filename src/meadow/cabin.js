// 草原场景 · 木屋（原木叠砌结构，全程序化，不使用外部模型）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';
import {
  barkTexture, woodRingTexture, woodPlankTexture, shingleTexture,
  stoneTexture, plasterTexture, moteTexture,
} from './textures.js';

/* ----------------------------- 尺寸约定 ----------------------------- */
export const CABIN = {
  W: 5.6,           // x 向宽
  D: 4.6,           // z 向深
  LOG_R: 0.17,      // 原木半径
  COURSES: 7,       // 原木层数
  OVER: 0.36,       // 转角出头
  RISE: 1.55,       // 屋脊相对墙顶抬升
  EAVE_OVER: 0.55,  // 屋檐外伸
  FLOOR_Y: 0.22,    // 室内地坪标高
};
const { W, D, LOG_R, COURSES, OVER, RISE, EAVE_OVER, FLOOR_Y } = CABIN;
const SPACING = LOG_R * 2.27;                                  // 层间距 > 直径 → 留出可填缝的缝
const WALL_TOP = FLOOR_Y + LOG_R + (COURSES - 1) * SPACING + LOG_R;
const RIDGE_Y = WALL_TOP + RISE;
const WALL_H = WALL_TOP - FLOOR_Y;
const EAVE_Z = D / 2 + EAVE_OVER;
const ROOF_ANG = Math.atan2(RISE, EAVE_Z);
const SLOPE_LEN = Math.sqrt(RISE * RISE + EAVE_Z * EAVE_Z);

/* --------------------------- 门窗洞口 --------------------------- */
// u：沿墙方向坐标；y：相对地坪高度。用于把原木真断料，而不是把门窗贴上去
const FRONT_OPENINGS = [
  { u0: -0.56, u1: 0.56, y0: -0.10, y1: 2.14 },
  { u0: -2.44, u1: -1.42, y0: 1.00, y1: 2.00 },
];
const BACK_OPENINGS = [{ u0: 1.42, u1: 2.44, y0: 1.00, y1: 2.00 }];
const SIDE_OPENINGS = [{ u0: -0.52, u1: 0.52, y0: 1.00, y1: 2.00 }];

/* ----------------------------- 工具 ----------------------------- */
function logAlong(len, cx, y, cz, axis, r, seed) {
  const rnd = mulberry32(seed);
  const r0 = r * (0.95 + rnd() * 0.08);
  const r1 = r * (0.95 + rnd() * 0.08);
  const side = new THREE.CylinderGeometry(r1, r0, len, 12, 1, true);
  const capA = new THREE.CircleGeometry(r1, 12);
  const capB = new THREE.CircleGeometry(r0, 12);

  if (axis === 'x') {
    side.rotateZ(-Math.PI / 2);
    capA.rotateY(Math.PI / 2);
    capB.rotateY(-Math.PI / 2);
    capA.translate(cx + len / 2, y, cz);
    capB.translate(cx - len / 2, y, cz);
  } else {
    side.rotateX(Math.PI / 2);
    capB.rotateY(Math.PI);
    capA.translate(cx, y, cz + len / 2);
    capB.translate(cx, y, cz - len / 2);
  }
  side.translate(cx, y, cz);
  return { side, caps: [capA, capB] };
}

/** 按洞口把墙长切成可见段 */
function segmentsFor(yRel, runMin, runMax, openings) {
  let segs = [[runMin, runMax]];
  for (const op of openings) {
    if (yRel + LOG_R < op.y0 || yRel - LOG_R > op.y1) continue;
    const next = [];
    for (const [a, b] of segs) {
      if (op.u1 <= a || op.u0 >= b) { next.push([a, b]); continue; }
      if (op.u0 > a) next.push([a, op.u0]);
      if (op.u1 < b) next.push([op.u1, b]);
    }
    segs = next;
  }
  return segs.filter(([a, b]) => b - a > 0.12);
}

/* ============================== 主体 ============================== */
export function createCabin() {
  const group = new THREE.Group();
  group.name = 'cabin';
  const rnd = mulberry32(60321);
  let seedCounter = 1;

  /* ---------- 材质 ---------- */
  const barkMat = new THREE.MeshStandardMaterial({
    map: barkTexture({ repeat: [3, 1], base: [128, 100, 70] }),
    roughness: 0.93, metalness: 0.0, envMapIntensity: 0.45,
  });
  const ringMat = new THREE.MeshStandardMaterial({
    map: woodRingTexture({ base: [208, 174, 120] }),
    roughness: 0.82, metalness: 0.0, envMapIntensity: 0.5,
  });
  const chinkMat = new THREE.MeshStandardMaterial({
    map: plasterTexture({ repeat: [3, 2] }),
    roughness: 0.96, metalness: 0.0, envMapIntensity: 0.35, color: 0xc4b89e,
  });
  const shingleMat = new THREE.MeshStandardMaterial({
    map: shingleTexture({ repeat: [6, 3] }),
    roughness: 0.9, metalness: 0.0, envMapIntensity: 0.4,
  });
  const roofWoodMat = new THREE.MeshStandardMaterial({
    map: woodPlankTexture({ repeat: [6, 2], base: [104, 78, 52], plankCount: 4, vertical: true, seed: 12 }),
    roughness: 0.9, metalness: 0.0, envMapIntensity: 0.35,
  });
  const doorMat = new THREE.MeshStandardMaterial({
    map: woodPlankTexture({ repeat: [1, 1], base: [122, 88, 56], plankCount: 5, vertical: true, seed: 4 }),
    roughness: 0.75, metalness: 0.0, envMapIntensity: 0.5,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    map: woodPlankTexture({ repeat: [1, 1], base: [112, 82, 54], plankCount: 2, vertical: false, seed: 9 }),
    roughness: 0.82, metalness: 0.0, envMapIntensity: 0.45,
  });
  const beamMat = new THREE.MeshStandardMaterial({
    map: woodPlankTexture({ repeat: [2, 1], base: [98, 72, 48], plankCount: 1, vertical: false, seed: 17 }),
    roughness: 0.88, metalness: 0.0, envMapIntensity: 0.35,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    map: stoneTexture({ repeat: [3, 2] }),
    roughness: 0.95, metalness: 0.0, envMapIntensity: 0.4,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0b1311, roughness: 0.06, metalness: 0.3, envMapIntensity: 3.0,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x2b2b28, roughness: 0.55, metalness: 0.85, envMapIntensity: 1.2,
  });

  const meshes = [];
  const put = (geo, mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (name) m.name = name;
    meshes.push(m);
    return m;
  };

  /* ---------- 1. 石砌地基 ---------- */
  const foundH = 1.0;
  const found = new THREE.BoxGeometry(W + 0.52, foundH, D + 0.52);
  found.translate(0, FLOOR_Y - foundH / 2, 0);
  put(found, stoneMat, 'foundation');

  const floor = new THREE.BoxGeometry(W - 0.1, 0.1, D - 0.1);
  floor.translate(0, FLOOR_Y - 0.02, 0);
  put(floor, trimMat, 'floor');

  /* ---------- 2. 原木墙体（含洞口断料） ---------- */
  const sideGeos = [], capGeos = [];
  const pushLog = (len, cx, y, cz, axis) => {
    const { side, caps } = logAlong(len, cx, y, cz, axis, LOG_R, seedCounter++);
    sideGeos.push(side);
    capGeos.push(...caps);
  };

  for (let i = 0; i < COURSES; i++) {
    const y = FLOOR_Y + LOG_R + i * SPACING + (rnd() - 0.5) * 0.01;
    const yRel = y - FLOOR_Y;

    for (const [a, b] of segmentsFor(yRel, -W / 2 - OVER, W / 2 + OVER, FRONT_OPENINGS)) {
      pushLog(b - a, (a + b) / 2, y, D / 2, 'x');
    }
    for (const [a, b] of segmentsFor(yRel, -W / 2 - OVER, W / 2 + OVER, BACK_OPENINGS)) {
      pushLog(b - a, (a + b) / 2, y, -D / 2, 'x');
    }
    for (const [a, b] of segmentsFor(yRel, -D / 2 - OVER, D / 2 + OVER, SIDE_OPENINGS)) {
      pushLog(b - a, W / 2, y, (a + b) / 2, 'z');
      pushLog(b - a, -W / 2, y, (a + b) / 2, 'z');
    }
  }

  /* ---------- 3. 山墙（沿屋面收分的原木层） ---------- */
  for (let j = 0; ; j++) {
    const h = LOG_R + j * SPACING;
    if (h + LOG_R > RISE - 0.04) break;
    const half = Math.min(D / 2, EAVE_Z * (1 - (h + LOG_R) / RISE));
    if (half < 0.3) break;
    const y = WALL_TOP + h;
    pushLog(half * 2, W / 2, y, 0, 'z');
    pushLog(half * 2, -W / 2, y, 0, 'z');
  }

  const barkMesh = new THREE.Mesh(mergeGeometries(sideGeos, false), barkMat);
  barkMesh.castShadow = barkMesh.receiveShadow = true;
  barkMesh.name = 'logWalls';
  meshes.push(barkMesh);

  const ringMesh = new THREE.Mesh(mergeGeometries(capGeos, false), ringMat);
  ringMesh.castShadow = ringMesh.receiveShadow = true;
  ringMesh.name = 'logEnds';
  meshes.push(ringMesh);

  /* ---------- 4. 填缝灰浆：藏在原木缝隙后侧 ---------- */
  const chink = new THREE.BoxGeometry(W - 0.02, WALL_H, D - 0.02);
  chink.translate(0, FLOOR_Y + WALL_H / 2, 0);
  const chinkMesh = new THREE.Mesh(chink, chinkMat);
  chinkMesh.castShadow = false;
  chinkMesh.receiveShadow = true;
  chinkMesh.name = 'chinking';
  meshes.push(chinkMesh);

  // 山墙三角填缝板
  const shape = new THREE.Shape();
  shape.moveTo(-D / 2 + 0.02, WALL_TOP);
  shape.lineTo(D / 2 - 0.02, WALL_TOP);
  shape.lineTo(0, RIDGE_Y - 0.06);
  shape.closePath();
  const gablePanel = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
  gablePanel.rotateY(-Math.PI / 2);   // 形状平面 → ZY 平面，挤出方向 → -X
  const gp1 = gablePanel.clone(); gp1.translate(W / 2 - 0.03, 0, 0);
  const gp2 = gablePanel.clone(); gp2.translate(-W / 2 + 0.08, 0, 0);
  const gableMesh = new THREE.Mesh(mergeGeometries([gp1, gp2], false), chinkMat);
  gableMesh.receiveShadow = true;
  gableMesh.name = 'gableChinking';
  meshes.push(gableMesh);

  /* ---------- 5. 屋顶（每坡独立成网格，顶面木瓦 / 其余木构） ---------- */
  const roofLen = W + 2 * EAVE_OVER;
  const roofMats = [roofWoodMat, roofWoodMat, shingleMat, roofWoodMat, roofWoodMat, roofWoodMat];
  for (const s of [1, -1]) {
    const g = new THREE.BoxGeometry(roofLen, 0.16, SLOPE_LEN);
    g.rotateX(s * ROOF_ANG);
    g.translate(0, WALL_TOP + RISE / 2 + 0.05, s * (EAVE_Z / 2));
    const m = new THREE.Mesh(g, roofMats);
    m.castShadow = m.receiveShadow = true;
    m.name = 'roof';
    meshes.push(m);
  }

  const ridge = new THREE.BoxGeometry(roofLen, 0.15, 0.3);
  ridge.translate(0, RIDGE_Y + 0.07, 0);
  put(ridge, trimMat, 'ridge');

  for (const s of [1, -1]) {
    const f = new THREE.BoxGeometry(roofLen, 0.22, 0.06);
    f.translate(0, WALL_TOP - 0.04, s * (EAVE_Z - 0.03));
    put(f, trimMat, 'fascia');
  }
  for (const sx of [-1, 1]) {
    for (const sz of [1, -1]) {
      const g = new THREE.BoxGeometry(0.07, 0.24, SLOPE_LEN);
      g.rotateX(sz * ROOF_ANG);
      g.translate(sx * (roofLen / 2 - 0.05), WALL_TOP + RISE / 2 + 0.1, sz * (EAVE_Z / 2));
      put(g, trimMat, 'bargeBoard');
    }
  }

  /* ---------- 6. 门 ---------- */
  const doorW = 1.12, doorH = 2.2, dz = D / 2;
  const jambL = new THREE.BoxGeometry(0.11, doorH, 0.17); jambL.translate(-doorW / 2, FLOOR_Y + doorH / 2, dz - 0.02);
  const jambR = new THREE.BoxGeometry(0.11, doorH, 0.17); jambR.translate(doorW / 2, FLOOR_Y + doorH / 2, dz - 0.02);
  const lintel = new THREE.BoxGeometry(doorW + 0.22, 0.15, 0.17); lintel.translate(0, FLOOR_Y + doorH + 0.06, dz - 0.02);
  put(mergeGeometries([jambL, jambR, lintel], false), trimMat, 'doorFrame');

  const leafW = doorW - 0.12;
  const leaf = new THREE.BoxGeometry(leafW, doorH - 0.16, 0.075);
  leaf.translate(0, FLOOR_Y + (doorH - 0.16) / 2 + 0.02, dz - 0.085);
  put(leaf, doorMat, 'doorLeaf');

  const battens = [];
  for (const by of [0.42, 1.08, 1.76]) {
    const b = new THREE.BoxGeometry(leafW, 0.12, 0.035);
    b.translate(0, FLOOR_Y + by, dz - 0.13);
    battens.push(b);
  }
  const brace = new THREE.BoxGeometry(0.11, 1.52, 0.03);
  brace.rotateZ(0.42);
  brace.translate(0, FLOOR_Y + 1.09, dz - 0.13);
  battens.push(brace);
  put(mergeGeometries(battens, false), trimMat, 'doorBattens');

  const latch = new THREE.BoxGeometry(0.22, 0.05, 0.05); latch.translate(0.3, FLOOR_Y + 1.02, dz - 0.145);
  const knob = new THREE.SphereGeometry(0.036, 10, 8); knob.translate(0.24, FLOOR_Y + 1.02, dz - 0.17);
  const hw = [latch, knob];
  for (const hy of [0.22, 1.94]) {
    const g = new THREE.BoxGeometry(0.17, 0.09, 0.03);
    g.translate(-leafW / 2 + 0.03, FLOOR_Y + hy, dz - 0.145);
    hw.push(g);
  }
  put(mergeGeometries(hw, false), metalMat, 'doorHardware');

  /* ---------- 7. 门廊与台阶 ---------- */
  const slab = new THREE.BoxGeometry(4.4, 0.18, 0.8);
  slab.translate(0, FLOOR_Y - 0.09, D / 2 + 0.42);
  put(slab, stoneMat, 'porchSlab');

  const step = new THREE.BoxGeometry(2.3, 0.16, 0.52);
  step.translate(0, FLOOR_Y - 0.26, D / 2 + 1.06);
  put(step, stoneMat, 'step');

  const postBase = FLOOR_Y - 0.02;
  const postTop = WALL_TOP - 0.17;
  const postGeos = [], beamGeos = [];
  for (const px of [-1.95, 1.95]) {
    const post = new THREE.CylinderGeometry(0.105, 0.125, postTop - postBase, 10);
    post.translate(px, (postTop + postBase) / 2, EAVE_Z - 0.15);
    postGeos.push(post);
    const knee = new THREE.BoxGeometry(0.09, 0.09, 0.44);
    knee.translate(px, postTop - 0.24, EAVE_Z - 0.38);
    beamGeos.push(knee);
  }
  const header = new THREE.BoxGeometry(4.5, 0.18, 0.18);
  header.translate(0, postTop + 0.02, EAVE_Z - 0.15);
  beamGeos.push(header);
  put(mergeGeometries(postGeos, false), barkMat, 'porchPosts');
  put(mergeGeometries(beamGeos, false), beamMat, 'porchBeams');

  /* ---------- 8. 窗 ---------- */
  const windowUnit = (wall, u, yBase, w = 0.98, h = 0.94) => {
    const ft = 0.09, fd = 0.15;
    const parts = [];
    const top = new THREE.BoxGeometry(w + ft * 2, ft, fd); top.translate(0, yBase + h + ft / 2, 0);
    const bot = new THREE.BoxGeometry(w + ft * 2, ft, fd); bot.translate(0, yBase - ft / 2, 0);
    const lft = new THREE.BoxGeometry(ft, h, fd); lft.translate(-w / 2 - ft / 2, yBase + h / 2, 0);
    const rgt = new THREE.BoxGeometry(ft, h, fd); rgt.translate(w / 2 + ft / 2, yBase + h / 2, 0);
    const sill = new THREE.BoxGeometry(w + 0.46, 0.09, fd + 0.2); sill.translate(0, yBase - ft - 0.03, 0.05);
    const mv = new THREE.BoxGeometry(0.05, h, 0.05); mv.translate(0, yBase + h / 2, 0.01);
    const mh = new THREE.BoxGeometry(w, 0.05, 0.05); mh.translate(0, yBase + h * 0.53, 0.01);
    parts.push(top, bot, lft, rgt, sill, mv, mh);

    const wrap = new THREE.Group();
    const frameMesh = new THREE.Mesh(mergeGeometries(parts, false), trimMat);
    frameMesh.castShadow = frameMesh.receiveShadow = true;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
    glass.position.set(0, yBase + h / 2, -0.025);
    glass.receiveShadow = true;
    wrap.add(frameMesh, glass);

    for (const s of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(w / 2 + 0.08, h + 0.18, 0.045), doorMat);
      sh.position.set(s * (w / 2 + 0.4), yBase + h / 2, 0.11);
      sh.castShadow = sh.receiveShadow = true;
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.03), metalMat);
      hinge.position.set(s * (w / 2 + 0.2), yBase + h / 2, 0.14);
      wrap.add(sh, hinge);
    }

    if (wall.axis === 'z') {
      wrap.position.set(u, 0, wall.sign * (D / 2 - 0.03));
      if (wall.sign < 0) wrap.rotation.y = Math.PI;
    } else {
      wrap.position.set(wall.sign * (W / 2 - 0.03), 0, u);
      wrap.rotation.y = wall.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    group.add(wrap);
  };

  windowUnit({ axis: 'z', sign: 1 }, -1.93, FLOOR_Y + 1.03);
  windowUnit({ axis: 'z', sign: -1 }, 1.93, FLOOR_Y + 1.03);
  windowUnit({ axis: 'x', sign: 1 }, 0, FLOOR_Y + 1.03);
  windowUnit({ axis: 'x', sign: -1 }, 0, FLOOR_Y + 1.03);

  /* ---------- 9. 烟囱 ---------- */
  const chX = -1.74, chZ = -0.88, chW = 0.76;
  const chTop = RIDGE_Y + 0.66;
  const chBottom = FLOOR_Y - 0.75;
  const chimney = new THREE.BoxGeometry(chW, chTop - chBottom, chW);
  chimney.translate(chX, (chTop + chBottom) / 2, chZ);
  put(chimney, stoneMat, 'chimney');
  const chCap = new THREE.BoxGeometry(chW + 0.24, 0.14, chW + 0.24);
  chCap.translate(chX, chTop + 0.07, chZ);
  put(chCap, stoneMat, 'chimneyCap');
  const flue = new THREE.CylinderGeometry(0.14, 0.14, 0.36, 10, 1, true);
  flue.translate(chX, chTop + 0.3, chZ);
  put(flue, metalMat, 'flue');

  /* ---------- 10. 柴垛与劈柴墩 ---------- */
  const pileGeos = [], pileCaps = [];
  const pileX = -4.9, pileZ = 1.5;
  for (let row = 0; row < 5; row++) {
    const perRow = 9 - Math.abs(row - 2);
    for (let k = 0; k < perRow; k++) {
      const y = 0.1 + row * 0.19;
      const z = pileZ - 0.5 + k * 0.2 + (rnd() - 0.5) * 0.03;
      const g = new THREE.CylinderGeometry(0.09, 0.09, 1.5, 9, 1, true);
      g.rotateZ(Math.PI / 2);
      g.translate(pileX, y, z);
      pileGeos.push(g);
      for (const s of [1, -1]) {
        const cg = new THREE.CircleGeometry(0.09, 9);
        cg.rotateY(s > 0 ? Math.PI / 2 : -Math.PI / 2);
        cg.translate(pileX + s * 0.75, y, z);
        pileCaps.push(cg);
      }
    }
  }
  put(mergeGeometries(pileGeos, false), barkMat, 'woodpile');
  put(mergeGeometries(pileCaps, false), ringMat, 'woodpileEnds');

  const stump = new THREE.CylinderGeometry(0.3, 0.34, 0.56, 14);
  stump.translate(3.7, 0.24, 3.0);
  put(stump, barkMat, 'stump');
  const stumpTop = new THREE.CircleGeometry(0.3, 14);
  stumpTop.rotateX(-Math.PI / 2);
  stumpTop.translate(3.7, 0.525, 3.0);
  put(stumpTop, ringMat, 'stumpTop');

  /* ---------- 组装 ---------- */
  for (const m of meshes) group.add(m);

  const smoke = createSmoke(new THREE.Vector3(chX, chTop + 0.45, chZ));
  group.add(smoke.points);

  return {
    group,
    smoke,
    materials: { barkMat, ringMat, chinkMat, shingleMat, trimMat, doorMat, stoneMat, glassMat, beamMat },
    meta: { W, D, WALL_TOP, RIDGE_Y },
  };
}

/* ------------------------------ 炊烟 ------------------------------ */
function createSmoke(origin) {
  const N = 240;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  const rnd = mulberry32(5150);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
    seed[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(origin.clone(), 60);

  const uniforms = {
    uTime: { value: 0 },
    uOrigin: { value: origin.clone() },
    uWindDir: { value: new THREE.Vector2(0.94, 0.34).normalize() },
    uWind: { value: 0.55 },
    uTexture: { value: moteTexture(128) },
    uSkyColor: { value: new THREE.Color('#cfd9e2') },
    uScale: { value: 1.0 },
    uProj: { value: 900.0 },   // 屏幕高度 / (2 tan(fov/2))，用于把世界尺寸换算成点尺寸
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec3  uOrigin;
      uniform vec2  uWindDir;
      uniform float uWind;
      uniform float uScale;
      uniform float uProj;
      varying float vAlpha;
      varying float vSeed;
      void main(){
        float speed = 0.16 + aSeed * 0.10;
        float age = mod(uTime * speed + aSeed * 9.17, 1.0);

        float rise = age * (4.2 + aSeed * 3.0);
        float spread = 0.12 + age * 1.6;
        float ang = aSeed * 43.0 + uTime * 0.18;
        vec3 p = uOrigin;
        p.x += cos(ang) * spread * 0.6;
        p.z += sin(ang * 1.27) * spread * 0.6;
        p.y += rise;
        p.xz += uWindDir * rise * uWind;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float worldSize = 0.5 + age * 3.4;
        gl_PointSize = clamp(uScale * worldSize * uProj / max(0.001, -mv.z), 1.0, 420.0);
        vAlpha = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.25, 1.0, age));
        vSeed = aSeed;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTexture;
      uniform vec3 uSkyColor;
      varying float vAlpha;
      varying float vSeed;
      void main(){
        vec4 t = texture2D(uTexture, gl_PointCoord);
        float a = t.a * vAlpha * 0.30;
        if (a < 0.004) discard;
        vec3 col = mix(vec3(0.87, 0.88, 0.89), uSkyColor, vSeed * 0.55);
        gl_FragColor = vec4(col, a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'smoke';
  return { points, uniforms };
}
