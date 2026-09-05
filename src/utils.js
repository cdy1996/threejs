import * as THREE from 'three';

/** 场景全局尺寸约定（世界单位） */
export const TANK = {
  baseRadius: 6.6,
  baseHeight: 1.2,
  glassRadius: 6.0,
  glassBottomY: 1.2,
  glassHeight: 8.0,
  waterRadius: 5.9,
  waterBottomY: 1.3,
  waterTopY: 8.6
};

export const COLORS = {
  bgSky: 0x8fd0cc,
  bgUnder: 0x0e4a52,
  fogSky: 0xa8dcd8,
  fogUnder: 0x0c4750,
  waterShallow: 0x7fdecd,
  waterDeep: 0x0c5f6a,
  glass: 0x88cccc,
  sand: 0xe8d8a8,
  rock: 0xbfc8c6,
  coral: 0xe8503f,
  seaweed: 0x3fae6a,
  algae: 0x67b357,
  boatHull: 0xe2574c,
  boatCabin: 0xf7f3e8
};

/** 随机工具 */
export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));

/** 卡通渐变贴图（三阶硬边界） */
export function makeToonGradient() {
  const data = new Uint8Array([80, 160, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

export function toonMaterial(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: makeToonGradient(), ...opts });
}

/** 判断点是否在半径 r 的六边形（与鱼缸同向）内 */
export function insideHexagon(x, z, r) {
  const absX = Math.abs(x);
  const absZ = Math.abs(z);
  // 六棱柱（cylinder 6 段）的平面约束：|x| + |x|/2 + (√3/2)|z| ≤ 1.5r（flat-top 近似圆滑处理即可）
  return absX * 1.5 + absZ * 0.866 <= r * 1.5;
}
