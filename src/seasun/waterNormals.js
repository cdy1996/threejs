import * as THREE from 'three';

// 32 位整数哈希 → [0, 1)
function hash2i(ix, iy, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 格点周期为 period 的 value noise，保证在 u/v 方向 0 与 1 处取值一致
function valueNoise(x, y, period, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const ax = ((x0 % period) + period) % period;
  const ay = ((y0 % period) + period) % period;
  const bx = (ax + 1) % period;
  const by = (ay + 1) % period;

  const n00 = hash2i(ax, ay, seed);
  const n10 = hash2i(bx, ay, seed);
  const n01 = hash2i(ax, by, seed);
  const n11 = hash2i(bx, by, seed);

  const top = n00 + (n10 - n00) * ux;
  const bottom = n01 + (n11 - n01) * ux;
  return top + (bottom - top) * uy;
}

// 分形叠加，每层周期翻倍且始终整除 size，因此结果可以无缝平铺
function fbm(u, v, basePeriod, octaves, seed) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let period = basePeriod;

  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u * period, v * period, period, seed + o * 131);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

/**
 * 程序化生成水面法线贴图（切线空间，RGB 编码），替代 three.js 示例里的 waternormals.jpg。
 * 高度场 → 中心差分求梯度 → 归一化法线，并做直方图拉伸以增强波纹对比。
 */
export function createWaterNormals({
  size = 512,
  basePeriod = 4,
  octaves = 6,
  strength = 1.5,
  seed = 1337,
} = {}) {
  const height = new Float32Array(size * size);
  let min = Infinity;
  let max = -Infinity;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = fbm((x + 0.5) / size, (y + 0.5) / size, basePeriod, octaves, seed);
      height[y * size + x] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }

  const range = max - min || 1;
  for (let i = 0; i < height.length; i++) {
    height[i] = (height[i] - min) / range;
  }

  const data = new Uint8Array(size * size * 4);
  const scale = strength * size * 0.05;

  for (let y = 0; y < size; y++) {
    const yu = ((y - 1 + size) % size) * size;
    const yd = ((y + 1) % size) * size;
    const yc = y * size;

    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size;
      const xr = (x + 1) % size;

      const dx = (height[yc + xr] - height[yc + xl]) * 0.5 * scale;
      const dy = (height[yd + x] - height[yu + x]) * 0.5 * scale;

      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (yc + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
