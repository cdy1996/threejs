// 草原场景 · 地形：高度场 + 道路距离场 + 地表材质
import * as THREE from 'three';
import { fbm2, smoothstep, clamp, lerp } from './noise.js';
import { groundTexture, noiseBump } from './textures.js';

export const TERRAIN_SIZE = 190;
export const FIELD_HALF = TERRAIN_SIZE / 2;

/** 小路中心线（世界 XZ），从木屋门口蜿蜒伸向远方 */
const PATH_PTS = [
  [0.0, 2.35], [0.15, 4.1], [1.35, 6.5], [1.05, 9.3], [2.65, 12.5],
  [2.15, 16.0], [3.65, 20.2], [2.95, 25.0], [5.25, 30.4], [4.35, 36.0],
  [6.6, 44.0], [7.4, 54.0], [9.0, 68.0]
];

/** Catmull-Rom 采样成密集折线 */
function samplePath(pts, per = 14) {
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, z]);
    }
  }
  return out;
}

const PATH_SAMPLES = samplePath(PATH_PTS);

/** 距离场：把折线距离预烘焙到网格，查询走双线性采样 */
const FIELD_RES = 320;
const field = new Float32Array(FIELD_RES * FIELD_RES);
(function bakeField() {
  for (let gy = 0; gy < FIELD_RES; gy++) {
    const z = -FIELD_HALF + (gy / (FIELD_RES - 1)) * TERRAIN_SIZE;
    for (let gx = 0; gx < FIELD_RES; gx++) {
      const x = -FIELD_HALF + (gx / (FIELD_RES - 1)) * TERRAIN_SIZE;
      let best = 1e9;
      for (let i = 0; i < PATH_SAMPLES.length - 1; i++) {
        const ax = PATH_SAMPLES[i][0], az = PATH_SAMPLES[i][1];
        const bx = PATH_SAMPLES[i + 1][0], bz = PATH_SAMPLES[i + 1][1];
        const vx = bx - ax, vz = bz - az;
        const wx = x - ax, wz = z - az;
        const len2 = vx * vx + vz * vz || 1e-6;
        let t = (wx * vx + wz * vz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = wx - vx * t, dz = wz - vz * t;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) best = d2;
      }
      field[gy * FIELD_RES + gx] = Math.sqrt(best);
    }
  }
})();

/** 到小路的距离（米） */
export function pathDistance(x, z) {
  const fx = ((x + FIELD_HALF) / TERRAIN_SIZE) * (FIELD_RES - 1);
  const fz = ((z + FIELD_HALF) / TERRAIN_SIZE) * (FIELD_RES - 1);
  const x0 = clamp(Math.floor(fx), 0, FIELD_RES - 2);
  const z0 = clamp(Math.floor(fz), 0, FIELD_RES - 2);
  const tx = clamp(fx - x0, 0, 1), tz = clamp(fz - z0, 0, 1);
  const a = field[z0 * FIELD_RES + x0], b = field[z0 * FIELD_RES + x0 + 1];
  const c = field[(z0 + 1) * FIELD_RES + x0], d = field[(z0 + 1) * FIELD_RES + x0 + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

/** 地形高度（世界单位，米） */
export function terrainHeight(x, z) {
  let h = 0;
  h += fbm2(x * 0.0135 + 100, z * 0.0135 - 40, 4) * 5.4;   // 大缓坡
  h += fbm2(x * 0.052 + 7, z * 0.052 + 21, 4) * 1.05;      // 中起伏
  h += fbm2(x * 0.24 - 13, z * 0.24 + 5, 3) * 0.17;        // 小起伏

  // 木屋场地压平成台地
  const r = Math.hypot(x, z);
  const flat = smoothstep(8.5, 27, r);
  h *= flat;

  // 小路被踩出的浅槽
  const pd = pathDistance(x, z);
  const track = 1 - smoothstep(0.9, 2.6, pd);
  h -= track * 0.11;

  // 微观颗粒，避免"塑料平面感"
  h += fbm2(x * 0.62 - 4, z * 0.62 + 11, 2) * 0.045;
  return h;
}

/** 有限差分法线 */
export function terrainNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.35;
  const hL = terrainHeight(x - e, z), hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e), hU = terrainHeight(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

/** 地表是否可种草（道路 / 木屋基础内不长草） */
export function isBare(x, z) {
  if (pathDistance(x, z) < 1.15) return true;
  // 木屋 + 台阶区域
  if (Math.abs(x) < 4.6 && z > -3.6 && z < 3.9) return true;
  return false;
}

/* ------------------------------------------------------------------ */

export function createTerrain({ fogColor } = {}) {
  const seg = 260;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const cA = new THREE.Color();
  // 注意：这里填的是"反射率"而不是画面颜色。
  // map 已被拆成均值≈1 的细节层，所以顶点色 ≈ 最终反照率。
  // 数值参考真实草地：受光草叶约 0.30~0.45（线性），阴影处约 0.09~0.14。
  const green1 = new THREE.Color('#6f9440');   // 阴影 / 深色草丛
  const green2 = new THREE.Color('#a7c667');   // 受光草色
  const dry = new THREE.Color('#cbb877');      // 干枯斑块
  const dirt = new THREE.Color('#b0966a');     // 泥土
  const dark = new THREE.Color('#4d5f24');     // 草丛根部 / 洼地

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));

    const pd = pathDistance(x, z);
    const n = fbm2(x * 0.09 + 30, z * 0.09, 4);
    const n2 = fbm2(x * 0.4 - 9, z * 0.4 + 3, 3);

    cA.copy(green1).lerp(green2, clamp(0.5 + n * 0.9, 0, 1));
    cA.lerp(dry, clamp((n - 0.24) * 1.7, 0, 1) * 0.75);
    cA.lerp(dark, clamp(-n * 1.4, 0, 1) * 0.45);
    cA.offsetHSL(0, 0, n2 * 0.035);

    // 路面
    const road = 1 - smoothstep(0.85, 2.2, pd);
    cA.lerp(dirt, road * 0.85);

    col[i * 3] = cA.r; col[i * 3 + 1] = cA.g; col[i * 3 + 2] = cA.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const map = groundTexture(512, [40, 40]);
  const bump = noiseBump({ size: 512, repeat: [40, 40], freq: 30, oct: 4, contrast: 1.5 });

  const mat = new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.06,
    roughnessMap: bump,
    roughness: 0.96,
    metalness: 0.0,
    vertexColors: true,
    envMapIntensity: 0.95,
    color: 0xffffff,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';

  return { mesh, material: mat, geometry: geo, heightAt: terrainHeight, normalAt: terrainNormal, pathDistance };
}
